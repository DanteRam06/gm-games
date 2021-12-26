import type { UpdateEvents } from "../../common/types";
import useTitleBar from "../hooks/useTitleBar";
import router, { Context, makeRegex } from "../router";
import { local, localActions } from "./local";
import realtimeUpdate from "./realtimeUpdate";
import toWorker from "./toWorker";
import create from "zustand";
import routeInfos from "./routeInfos";

type Action = {
	url?: string;
	refresh: boolean;
	replace?: boolean;
	updateEvents: UpdateEvents;
	raw?: Record<string, unknown>;
};

type State = {
	Component: any;
	loading: boolean;
	inLeague: boolean;
	data: Record<string, any>;
};

type ViewInfo = {
	Component: any;
	id: string;
	inLeague: boolean;
	context: Context;
	cb: (a?: Error) => void;
};

export const useViewData = create<
	State & {
		actions: {
			startLoading: () => void;
			doneLoading: () => void;
			reset: (state: State) => void;
		};
	}
>(set => ({
	Component: undefined,
	loading: false,
	inLeague: false,
	data: {},
	actions: {
		startLoading: () => set({ loading: true }),
		doneLoading: () => set({ loading: false }),
		reset: (state: State) => {
			set(state);
		},
	},
}));

const actions = useViewData.getState().actions;

const ErrorMessage = ({ errorMessage }: { errorMessage: string }) => {
	useTitleBar({
		title: "Error",
	});
	return <p>{errorMessage}</p>;
};

class ViewManager {
	queue: Action[];
	viewData: Record<string, unknown>;
	idLoaded: string | undefined;
	processingAction: boolean;
	routes: {
		id: string;
		regex: RegExp;
	}[];

	// When navigation to a new URL happens (can be from clicking a link in which case it goes directly to fromRouter, or from realtimeUpdate in which case it goes to fromRealtimeUpdate first and then eventually fromRouter) we want to be able to discard any in-progress load. Do that by keeping track of a symbol associated with a navigation.
	lastNavigationSymbol: symbol;

	constructor() {
		this.queue = [];
		this.viewData = {};
		this.processingAction = false;
		this.lastNavigationSymbol = Symbol();

		this.routes = [];
		for (const [path, id] of Object.entries(routeInfos)) {
			const { regex } = makeRegex(path);
			this.routes.push({
				id,
				regex,
			});
		}
	}

	async fromRouter(viewInfo: ViewInfo) {
		try {
			// If coming from initAction, state will contain navigationSymbol, and it will have already been set to this.lastNavigationSymbol
			if (viewInfo.context.state.navigationSymbol) {
				if (
					this.lastNavigationSymbol !== viewInfo.context.state.navigationSymbol
				) {
					// Must have been another navigation before this one processed
					viewInfo.cb();
					return;
				}
			} else {
				// If coming only from router (like user clicked a link) then we set lastNavigationSymbol here and clear the queue
				this.lastNavigationSymbol = Symbol();
				this.queue = [];
			}

			await this.processUpdate(viewInfo, this.lastNavigationSymbol);
		} catch (error) {
			viewInfo.cb(error);
			return;
		}

		viewInfo.cb();
	}

	fromRealtimeUpdate(action: Action) {
		let navigationEvent = false;
		if (action.url) {
			// It's a "navigation event" if it is moving to a new page, rather than just changing some parameter of a page (like abbrev or season). So we need to get the id of this url and compare it to idLoaded.
			let id;
			const urlToMatch = action.url.split("?")[0].split("#")[0];
			for (const route of this.routes) {
				const m = route.regex.exec(decodeURIComponent(urlToMatch));

				if (m) {
					id = route.id;
					break;
				}
			}

			if (id && id !== this.idLoaded) {
				navigationEvent = true;
			}
		}

		if (navigationEvent) {
			this.lastNavigationSymbol = Symbol();
			this.queue = [];
			this.initAction(action);
		} else if (this.queue.length === 0 && !this.processingAction) {
			this.initAction(action);
		} else {
			this.queue.push(action);
		}
	}

	async initAction({ url, refresh, replace, updateEvents, raw }: Action) {
		this.processingAction = true;

		const state: any = {
			noTrack: refresh || replace,
			updateEvents,
			navigationSymbol: this.lastNavigationSymbol,
			...raw,
		};

		const actualURL = url ?? window.location.pathname + window.location.search;

		await router.navigate(actualURL, {
			state,
			refresh,
			replace,
		});
	}

	initNextAction() {
		this.processingAction = false;

		const nextAction = this.queue.shift();
		if (nextAction) {
			this.initAction(nextAction);
		}
	}

	async processUpdate(
		{ Component, context, id, inLeague }: ViewInfo,
		navigationSymbol: symbol,
	) {
		actions.startLoading();

		const updateEvents = context.state.updateEvents ?? [];

		let newLid: number | undefined;
		if (typeof context.params.lid === "string") {
			const newLidInt = parseInt(context.params.lid);
			if (!Number.isNaN(newLidInt)) {
				newLid = newLidInt;
			}
		}

		if (this.idLoaded !== id) {
			// This is the initial load of a page, so reset viewData and add firstRun update event
			if (!updateEvents.includes("firstRun")) {
				updateEvents.push("firstRun");
			}
			this.viewData = {};
		}

		const lid = local.getState().lid;

		if (inLeague) {
			if (newLid !== lid) {
				await toWorker("main", "beforeViewLeague", newLid, lid);
			}
		} else {
			// eslint-disable-next-line no-lonely-if
			if (lid !== undefined) {
				await toWorker("main", "beforeViewNonLeague");
				localActions.updateGameAttributes({
					lid: undefined,
				});
			}
		}

		if (navigationSymbol !== this.lastNavigationSymbol) {
			this.initNextAction();
			return;
		}

		// ctxBBGM is hacky!
		const ctxBBGM = { ...context.state };
		delete ctxBBGM.err; // Can't send Error to worker
		delete ctxBBGM.navigationSymbol; // Can't send Symbol to worker

		// Resolve all the promises before updating the UI to minimize flicker
		const results = await toWorker(
			"main",
			"runBefore",
			id,
			context.params,
			ctxBBGM,
			updateEvents,
			this.viewData,
		);

		if (navigationSymbol !== this.lastNavigationSymbol) {
			this.initNextAction();
			return;
		}

		// If results is undefined, it means the league wasn't loaded yet at the time of the request, likely because another league was opening in another tab at the same time. So stop now and wait until we get a signal that there is a new league.
		if (results === undefined) {
			actions.doneLoading();
			this.initNextAction();
			return;
		}

		// If there was an error before, still show it unless we've received some other data. Otherwise, noop refreshes (return undefined from view, for non-matching updateEvent) would clear the error. Clear it only when some data is returned... which still is not great, because maybe the data is from a runBefore function that's different than the one that produced the error. Ideally would either need to track which runBefore function produced the error, this is a hack. THIS MAY NO LONGER BE TRUE AFTER CONSOLIDATING RUNBEFORE INTO A SINGLE FUNCTION, ideally the worker/views function could then handle conflicts itself. But currently the only ones returning errorMessage have just one function so it's either all or nothing.
		if (results && Object.keys(results).length > 0) {
			delete this.viewData.errorMessage;
		}

		let NewComponent = Component;

		if (
			this.viewData.errorMessage ||
			(results && results.hasOwnProperty("errorMessage"))
		) {
			NewComponent = ErrorMessage;
		}

		const vars = {
			Component: NewComponent,
			data: Object.assign(this.viewData, results),
			loading: false,
			inLeague,
		};

		if (vars.data && vars.data.redirectUrl !== undefined) {
			// Wait a tick, otherwise there is a race condition on new page loads (such as reloading live_game box score) where initView is called and updates viewInfo while the local.subscribe subscription below is unsubscribed due to updatePage changing.
			await new Promise<void>(resolve => {
				setTimeout(() => {
					resolve();
				}, 0);
			});

			realtimeUpdate(
				[],
				vars.data.redirectUrl,
				{
					backendRedirect: true,
				},
				true,
			);

			this.initNextAction();
			return;
		}

		actions.reset(vars);
		this.idLoaded = id;
		this.viewData = vars.data;

		// Scroll to top if this load came from user clicking a link
		if (updateEvents.length === 1 && updateEvents[0] === "firstRun") {
			window.scrollTo(window.pageXOffset, 0);
		}

		this.initNextAction();
	}
}

export const viewManager = new ViewManager();
