// @flow

import classNames from "classnames";
import PropTypes from "prop-types";
import React, { useCallback, useRef, useState } from "react";
import { DIFFICULTY } from "../../common";
import { DataTable } from "../components";
import { getCols, setTitle, toWorker } from "../util";

const difficultyText = (difficulty: number) => {
	let prevText: string | void;
	for (const [text, numeric] of Object.entries(DIFFICULTY)) {
		if (typeof numeric !== "number") {
			throw new Error("Should never happen");
		}

		if (difficulty === numeric) {
			return text;
		}

		// Iteration is in order, so if we're below the value, there will be no direct hit
		if (difficulty < numeric) {
			if (prevText !== undefined) {
				return `${prevText}+`;
			}
			return `${text}-`;
		}

		prevText = text;
	}

	if (prevText !== undefined) {
		return `${prevText}+`;
	}

	return "???";
};

const DifficultyText = ({
	children: difficulty,
}: {
	children: number | void,
}) => {
	if (difficulty === undefined) {
		return null;
	}

	return (
		<span
			className={classNames({
				"font-weight-bold": difficulty > DIFFICULTY.Insane,
				"text-danger": difficulty >= DIFFICULTY.Insane,
			})}
		>
			{difficultyText(difficulty)}
		</span>
	);
};

DifficultyText.propTypes = {
	children: PropTypes.number,
};

const PlayButton = ({
	lid,
	loadingLID,
	setLoadingLID,
}: {
	lid: number,
	loadingLID?: number,
	setLoadingLID: (number | void) => void,
}) => {
	if (loadingLID === undefined) {
		return (
			<a
				className="btn btn-success"
				href={`/l/${lid}`}
				onClick={() => setLoadingLID(lid)}
			>
				Play
			</a>
		);
	}

	if (loadingLID === lid) {
		return (
			<button className="btn btn-success dashboard-play-loading">Play</button>
		);
	}

	return (
		<button className="btn btn-success" disabled>
			Play
		</button>
	);
};

const glyphiconStyle = {
	cursor: "pointer",
	fontSize: "larger",
};
const Star = ({ lid, starred }: { lid: number, starred?: boolean }) => {
	const [actuallyStarred, setActuallyStarred] = useState<boolean>(!!starred);

	const toggle = useCallback(async () => {
		setActuallyStarred(!actuallyStarred);

		await toWorker("updateLeague", lid, {
			starred: !actuallyStarred,
		});
	}, [actuallyStarred, lid]);

	if (actuallyStarred) {
		return (
			<span
				className="glyphicon glyphicon-star text-primary"
				data-no-row-highlight="true"
				onClick={toggle}
				style={glyphiconStyle}
			/>
		);
	}

	return (
		<span
			className="glyphicon glyphicon-star-empty text-muted"
			data-no-row-highlight="true"
			onClick={toggle}
			style={glyphiconStyle}
			title="Star"
		/>
	);
};

const LeagueName = ({
	lid,
	name,
	starred,
	loadingLID,
	setLoadingLID,
}: {
	lid: number,
	name: string,
	starred?: boolean,
	loadingLid?: number,
	setLoadingLID: (number | void) => void,
}) => {
	const [mode, setMode] = useState<"editing" | "saving" | "viewing">("viewing");
	const [liveName, setLiveName] = useState(name);

	const handleEdit = useCallback(() => {
		setMode("editing");
	}, []);

	const handleSubmit = useCallback(
		async event => {
			event.preventDefault();
			setMode("saving");
			await toWorker("updateLeague", lid, {
				name: liveName,
			});
			setMode("viewing");
		},
		[lid, liveName],
	);

	const nameBlock =
		mode === "viewing" ? (
			<a href={`/l/${lid}`} onClick={() => setLoadingLID(lid)}>
				{liveName}
			</a>
		) : (
			<form onSubmit={handleSubmit}>
				<input
					type="text"
					className="form-control form-control-sm"
					disabled={mode === "saving"}
					value={liveName}
					onChange={event => setLiveName(event.target.value)}
					style={{ maxWidth: 200 }}
				/>
			</form>
		);

	const controlsBlock =
		mode === "viewing" ? (
			<span
				className="glyphicon glyphicon-edit text-muted"
				data-no-row-highlight="true"
				style={glyphiconStyle}
				onClick={handleEdit}
				title="Edit Name"
			/>
		) : (
			<span
				className="glyphicon glyphicon-ok text-success"
				data-no-row-highlight="true"
				style={glyphiconStyle}
				onClick={handleSubmit}
				title="Save Name"
			/>
		);

	return (
		<div className="d-flex align-items-center">
			<Star lid={lid} starred={starred} />
			<div className="flex-grow-1 mx-2">{nameBlock}</div>
			{controlsBlock}
		</div>
	);
};

type Props = {
	leagues: {
		lid: number,
		starred?: boolean,
		name: string,
		phaseText: string,
		teamName: string,
		teamRegion: string,
		difficulty?: number,
	}[],
};

const Dashboard = ({ leagues }: Props) => {
	const [loadingLID, setLoadingLID] = useState<number | void>();

	setTitle("Dashboard");

	const cols = getCols(
		"",
		"League",
		"Team",
		"Phase",
		"Difficulty",
		"Created",
		"Last Played",
		"",
	);
	cols[0].width = "1%";
	cols[7].width = "1%";

	const rows = leagues.map(league => {
		return {
			key: league.lid,
			data: [
				{
					classNames: "dashboard-controls",
					value: (
						<PlayButton
							lid={league.lid}
							loadingLID={loadingLID}
							setLoadingLID={setLoadingLID}
						/>
					),
				},
				{
					classNames: "dashboard-controls",
					value: (
						<LeagueName
							lid={league.lid}
							name={league.name}
							starred={league.starred}
							loadingLID={loadingLID}
							setLoadingLID={setLoadingLID}
						/>
					),
				},
				`${league.teamRegion} ${league.teamName}`,
				league.phaseText,
				<DifficultyText>{league.difficulty}</DifficultyText>,
				new Date().toISOString().split("T")[0],
				new Date().toISOString().split("T")[0],
				{
					classNames: "dashboard-controls",
					value: (
						<div className="btn-group btn-group-sm">
							<a
								className={classNames("btn btn-light-bordered", {
									disabled: loadingLID !== undefined,
								})}
								href="#"
							>
								Import
							</a>
							<a
								className={classNames("btn btn-light-bordered", {
									disabled: loadingLID !== undefined,
								})}
								href={`/l/${league.lid}/export_league`}
								onClick={() => setLoadingLID(league.lid)}
							>
								Export
							</a>
							<a
								className={classNames("btn btn-light-bordered", {
									disabled: loadingLID !== undefined,
								})}
								href={`/delete_league/${league.lid}`}
							>
								Delete
							</a>
						</div>
					),
				},
			],
		};
	});

	return (
		<>
			<ul className="dashboard-boxes">
				<li className="dashboard-box-new">
					<a href="/new_league" className="btn btn-primary league">
						<h2>
							Create new
							<br />
							league
						</h2>
					</a>
				</li>
				<li>
					<a
						href={`https://play.${
							process.env.SPORT === "football" ? "basketball" : "football"
						}-gm.com/`}
						className="btn btn-light-bordered league"
						style={{
							backgroundImage: `url("https://play.${
								process.env.SPORT === "football" ? "basketball" : "football"
							}-gm.com/ico/icon70.png")`,
							backgroundRepeat: "no-repeat",
							backgroundPosition:
								process.env.SPORT === "football" ? "100px 41px" : "75px 41px",
							fontSize: "16px",
						}}
					>
						{process.env.SPORT === "football"
							? "Play the original, Basketball GM!"
							: "Try the brand new Football GM!"}
					</a>
				</li>
			</ul>

			<div className="clearfix" />

			<DataTable
				bordered={false}
				cols={cols}
				defaultSort={[6, "desc"]}
				name="Dashboard"
				small={false}
				rows={rows}
			/>
		</>
	);
};

Dashboard.propTypes = {
	leagues: PropTypes.arrayOf(
		PropTypes.shape({
			difficulty: PropTypes.number,
			lid: PropTypes.number.isRequired,
			name: PropTypes.string.isRequired,
			phaseText: PropTypes.string.isRequired,
			starred: PropTypes.bool,
			teamName: PropTypes.string.isRequired,
			teamRegion: PropTypes.string.isRequired,
		}),
	).isRequired,
};

export default Dashboard;
