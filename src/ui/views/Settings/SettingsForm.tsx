import classNames from "classnames";
import PropTypes from "prop-types";
import { useState, FormEvent, useEffect } from "react";
import { ActionButton, StickyBottomButtons } from "../../components";
import { confirm, localActions, logEvent } from "../../util";
import { settings } from "./settings";
import type { Category, Key, Values } from "./types";
import type { Settings } from "../../../worker/views/settings";
import type {
	InjuriesSetting,
	PlayerBioInfo,
	TragicDeaths,
} from "../../../common/types";
import SettingsFormOptions from "./SettingsFormOptions";

const encodeDecodeFunctions = {
	bool: {
		stringify: (value: boolean) => String(value),
		parse: (value: string) => value === "true",
	},
	custom: {},
	float: {
		stringify: (value: number) => String(value),
		parse: (value: string) => {
			const parsed = parseFloat(value);
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid number`);
			}
			return parsed;
		},
	},
	float1000: {
		stringify: (value: number) => String(value / 1000),
		parse: (value: string) => {
			const parsed = parseFloat(value) * 1000;
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid number`);
			}
			return parsed;
		},
	},
	floatOrNull: {
		stringify: (value: number | null) => (value === null ? "" : String(value)),
		parse: (value: string) => {
			if (value === "") {
				return null;
			}

			const parsed = parseFloat(value);
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid number`);
			}
			return parsed;
		},
	},
	int: {
		stringify: (value: number) => String(value),
		parse: (value: string) => {
			const parsed = parseInt(value);
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid integer`);
			}
			return parsed;
		},
	},
	intOrNull: {
		stringify: (value: number | null) => (value === null ? "" : String(value)),
		parse: (value: string) => {
			if (value === "") {
				return null;
			}

			const parsed = parseInt(value);
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid integer`);
			}
			return parsed;
		},
	},
	string: {},
	jsonString: {
		stringify: (value: any) => JSON.stringify(value),
		parse: (value: string) => JSON.parse(value),
	},
	rangePercent: {
		stringify: (value: number) => String(value),
		parse: (value: string) => {
			const parsed = parseFloat(value);
			if (Number.isNaN(parsed)) {
				throw new Error(`"${value}" is not a valid number`);
			}
			return parsed;
		},
	},
	floatValuesOrCustom: {
		stringify: (value: number, values: Values) => {
			const stringValue = String(value);
			return JSON.stringify([
				values.every(({ key }) => key !== stringValue),
				stringValue,
			]);
		},
		parse: (value: string) => {
			const parts = JSON.parse(value);
			const numberPart = parseFloat(parts[1]);
			if (Number.isNaN(numberPart)) {
				throw new Error(`"${numberPart}" is not a valid number`);
			}
			return numberPart;
		},
	},
};

const GodModeSettingsButton = ({
	children,
	className,
	godMode,
	disabled,
	onClick,
}: {
	children: any;
	className?: string;
	godMode: boolean;
	disabled?: boolean;
	onClick: () => void;
}) => {
	if (godMode) {
		return null;
	}

	return (
		<button
			type="button"
			className={classNames("btn btn-secondary", className)}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	);
};

const SPECIAL_STATE_OTHERS = [
	"injuries",
	"tragicDeaths",
	"playerBioInfo",
] as const;
const SPECIAL_STATE_BOOLEANS = ["godMode", "godModeInPast"] as const;
const SPECIAL_STATE_ALL = [...SPECIAL_STATE_BOOLEANS, ...SPECIAL_STATE_OTHERS];
type SpecialStateBoolean = typeof SPECIAL_STATE_BOOLEANS[number];
type SpecialStateAll = typeof SPECIAL_STATE_ALL[number];

type State = Record<Exclude<Key, SpecialStateAll>, string> &
	Record<SpecialStateBoolean, boolean> &
	Record<"injuries", InjuriesSetting> &
	Record<"tragicDeaths", TragicDeaths> &
	Record<"playerBioInfo", PlayerBioInfo | undefined>;

const SettingsForm = ({
	onCancel,
	onSave,
	onUpdateExtra,
	hasPlayers,
	newLeague,
	realPlayers,
	saveText = "Save Settings",
	...props
}: Settings & {
	onCancel?: () => void;
	onSave: (settings: Settings) => void;
	onUpdateExtra?: () => void;
	hasPlayers?: boolean;
	newLeague?: boolean;
	realPlayers?: boolean;
	saveText?: string;
}) => {
	const [showGodModeSettings, setShowGodModeSettings] = useState(true);

	useEffect(() => {
		localActions.update({
			stickyFormButtons: true,
		});

		return () => {
			localActions.update({
				stickyFormButtons: false,
			});
		};
	});

	const [submitting, setSubmitting] = useState(false);
	const [state, setStateRaw] = useState<State>(() => {
		// @ts-ignore
		const initialState: State = {};
		for (const { key, type, values } of settings) {
			if (SPECIAL_STATE_ALL.includes(key as any)) {
				continue;
			}

			const value = props[key];

			// https://github.com/microsoft/TypeScript/issues/21732
			// @ts-ignore
			const stringify = encodeDecodeFunctions[type].stringify;

			initialState[key] = stringify ? stringify(value, values) : value;
		}

		for (const key of [...SPECIAL_STATE_BOOLEANS, ...SPECIAL_STATE_OTHERS]) {
			(initialState as any)[key] = props[key];
		}

		return initialState;
	});
	const godMode = !!state.godMode;

	const setState = (arg: Parameters<typeof setStateRaw>[0]) => {
		setStateRaw(arg);
		if (onUpdateExtra) {
			onUpdateExtra();
		}
	};

	const handleGodModeToggle = async () => {
		let proceed: any = true;
		if (!state.godMode && !state.godModeInPast && !props.godModeInPast) {
			proceed = await confirm(
				"God Mode enables tons of customization features, including many of the settings found here. But if you ever enable God Mode in a league, you will not be awarded any achievements in that league, even if you disable God Mode.",
				{
					okText: "Enable God Mode",
				},
			);
		}

		if (proceed) {
			if (state.godMode) {
				setState(prevState => ({
					...prevState,
					godMode: false,
				}));
			} else {
				setState(prevState => ({
					...prevState,
					godMode: true,
					godModeInPast: true,
				}));
			}
		}
	};

	// Filter out the new league only ones when appropriate
	const filteredSettings = settings.filter(setting => {
		return (
			!setting.showOnlyIf ||
			setting.showOnlyIf({
				hasPlayers,
				newLeague,
				realPlayers,
			})
		);
	});

	const handleFormSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setSubmitting(true);

		const output = {} as unknown as Settings;
		for (const option of filteredSettings) {
			const { key, name, type } = option;
			const value = state[key];

			// https://github.com/microsoft/TypeScript/issues/21732
			// @ts-ignore
			const parse = encodeDecodeFunctions[type].parse;

			try {
				// @ts-ignore
				output[key] = parse ? parse(value) : value;
			} catch (error) {
				setSubmitting(false);
				logEvent({
					type: "error",
					text: `${name}: ${error.message}`,
					saveToDb: false,
					persistent: true,
				});
				return;
			}
		}

		for (const key of SPECIAL_STATE_BOOLEANS) {
			output[key] = state[key];
		}

		// Run validation functions at the end, so all values are available
		for (const option of filteredSettings) {
			const { key, name, validator } = option;
			try {
				if (validator) {
					await validator(output[key], output, props);
				}
			} catch (error) {
				setSubmitting(false);
				logEvent({
					type: "error",
					text: `${name}: ${error.message}`,
					saveToDb: false,
					persistent: true,
				});
				return;
			}
		}

		try {
			await onSave(output);
		} catch (error) {
			console.error(error);
			setSubmitting(false);
			logEvent({
				type: "error",
				text: error.message,
				saveToDb: false,
				persistent: true,
			});
			return;
		}

		setSubmitting(false);
	};

	const currentCategoryNames: Category[] = [];

	const toggleGodModeSettings = () => {
		setShowGodModeSettings(show => !show);
	};

	return (
		<div className="settings-wrapper mt-lg-2">
			<form onSubmit={handleFormSubmit} style={{ maxWidth: 2100 }}>
				<GodModeSettingsButton
					className="mb-5 d-sm-none"
					godMode={godMode}
					disabled={submitting}
					onClick={toggleGodModeSettings}
				>
					{showGodModeSettings ? "Hide" : "Show"} God Mode Settings
				</GodModeSettingsButton>

				<SettingsFormOptions
					filteredSettings={filteredSettings}
					godMode={godMode}
					newLeague={newLeague}
					showGodModeSettings={showGodModeSettings}
					submitting={submitting}
				/>

				<StickyBottomButtons>
					<div className="btn-group">
						<button
							className={classNames(
								"btn",
								godMode ? "btn-secondary" : "btn-god-mode",
							)}
							onClick={handleGodModeToggle}
							type="button"
							disabled={submitting}
						>
							{godMode ? "Disable God Mode" : "Enable God Mode"}
						</button>
						{!godMode ? (
							<GodModeSettingsButton
								className="d-none d-sm-block"
								godMode={godMode}
								disabled={submitting}
								onClick={toggleGodModeSettings}
							>
								{showGodModeSettings ? "Hide" : "Show"} God Mode settings
							</GodModeSettingsButton>
						) : null}
					</div>
					<div className="btn-group ms-auto">
						{onCancel ? (
							<button
								className="btn btn-secondary"
								type="button"
								disabled={submitting}
								onClick={onCancel}
							>
								Cancel
							</button>
						) : null}
						<ActionButton
							type="submit"
							disabled={submitting}
							processing={!!newLeague && submitting}
						>
							{saveText}
						</ActionButton>
					</div>
				</StickyBottomButtons>
			</form>
			<div className="settings-shortcuts flex-shrink-0">
				<ul className="list-unstyled">
					<li>Shortcuts: </li>
					{currentCategoryNames.map(name => (
						<li key={name} className="settings-shortcut">
							<a href={`#${name}`}>{name}</a>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};

SettingsForm.propTypes = {
	godMode: PropTypes.bool.isRequired,
	godModeInPast: PropTypes.bool.isRequired,
	luxuryPayroll: PropTypes.number.isRequired,
	luxuryTax: PropTypes.number.isRequired,
	maxContract: PropTypes.number.isRequired,
	minContract: PropTypes.number.isRequired,
	minPayroll: PropTypes.number.isRequired,
	minRosterSize: PropTypes.number.isRequired,
	maxRosterSize: PropTypes.number.isRequired,
	numActiveTeams: PropTypes.number.isRequired,
	numGames: PropTypes.number.isRequired,
	quarterLength: PropTypes.number.isRequired,
	salaryCap: PropTypes.number.isRequired,
	aiTradesFactor: PropTypes.number.isRequired,
	injuryRate: PropTypes.number.isRequired,
	tragicDeathRate: PropTypes.number.isRequired,
	brotherRate: PropTypes.number.isRequired,
	homeCourtAdvantage: PropTypes.number.isRequired,
	rookieContractLengths: PropTypes.arrayOf(PropTypes.number).isRequired,
	sonRate: PropTypes.number.isRequired,
	hardCap: PropTypes.bool.isRequired,
	numGamesPlayoffSeries: PropTypes.arrayOf(PropTypes.number).isRequired,
	numPlayoffByes: PropTypes.number.isRequired,
	draftType: PropTypes.string.isRequired,
	playersRefuseToNegotiate: PropTypes.bool.isRequired,
	budget: PropTypes.bool.isRequired,
	numSeasonsFutureDraftPicks: PropTypes.number.isRequired,
	foulRateFactor: PropTypes.number.isRequired,
	foulsNeededToFoulOut: PropTypes.number.isRequired,
	foulsUntilBonus: PropTypes.arrayOf(PropTypes.number).isRequired,
};

export default SettingsForm;
