import { idb } from "../../db";
import { g, helpers, logEvent } from "../../util";
import type { Conditions, GameResults } from "../../../common/types";
import season from "../season";
import { findSeries } from "./writeGameStats";

const updatePlayoffSeries = async (
	results: GameResults,
	conditions: Conditions,
) => {
	const playoffSeries = await idb.cache.playoffSeries.get(g.get("season"));
	if (!playoffSeries) {
		throw new Error("playoffSeries not found");
	}

	const numGamesToWinSeries =
		playoffSeries.currentRound === -1
			? 1
			: helpers.numGamesToWinSeries(
					g.get("numGamesPlayoffSeries", "current")[playoffSeries.currentRound],
			  );

	for (const result of results) {
		// Did the home (true) or away (false) team win this game? Here, "home" refers to this game, not the team which has homecourt advnatage in the playoffs, which is what series.home refers to below.
		const won0 = result.team[0].stat.pts > result.team[1].stat.pts;
		const series = findSeries(
			playoffSeries,
			result.team[0].id,
			result.team[1].id,
		);
		if (series && series.away) {
			const { away, home } = series;

			if (home.pts === undefined) {
				home.pts = 0;
			}

			if (away.pts === undefined) {
				away.pts = 0;
			}

			if (home.tid === result.team[0].id) {
				home.pts += result.team[0].stat.pts;
				away.pts += result.team[1].stat.pts;

				if (won0) {
					home.won += 1;
				} else {
					away.won += 1;
				}
			} else if (away.tid === result.team[0].id) {
				away.pts += result.team[0].stat.pts;
				home.pts += result.team[1].stat.pts;

				if (won0) {
					away.won += 1;
				} else {
					home.won += 1;
				}
			}

			if (series.gids === undefined) {
				series.gids = [];
			}
			series.gids.push(result.gid);
		} else {
			continue;
		}

		// Log result of playoff series
		if (
			series.away.won >= numGamesToWinSeries ||
			series.home.won >= numGamesToWinSeries
		) {
			let winnerPts;
			let winnerTid;
			let loserPts;
			let loserTid;
			let loserWon;

			if (series.away.won >= numGamesToWinSeries) {
				winnerPts = series.away.pts;
				winnerTid = series.away.tid;
				loserPts = series.home.pts;
				loserTid = series.home.tid;
				loserWon = series.home.won;
			} else {
				winnerPts = series.home.pts;
				winnerTid = series.home.tid;
				loserPts = series.away.pts;
				loserTid = series.away.tid;
				loserWon = series.away.won;
			}

			let currentRoundText = "";

			const playoffsByConf = await season.getPlayoffsByConf(g.get("season"));

			let saveToDb = true;
			if (playoffSeries.currentRound === -1) {
				currentRoundText = "play-in tournament";
			} else if (playoffSeries.currentRound === 0) {
				currentRoundText = `${helpers.ordinal(1)} round of the playoffs`;
			} else if (
				playoffSeries.currentRound ===
				g.get("numGamesPlayoffSeries", "current").length - 3
			) {
				currentRoundText = playoffsByConf
					? "conference semifinals"
					: "quarterfinals";
			} else if (
				playoffSeries.currentRound ===
				g.get("numGamesPlayoffSeries", "current").length - 2
			) {
				currentRoundText = playoffsByConf ? "conference finals" : "semifinals";

				// Not needed, because individual game event in writeGameStats will cover this round
				saveToDb = false;
			} else if (
				playoffSeries.currentRound ===
				g.get("numGamesPlayoffSeries", "current").length - 1
			) {
				currentRoundText = "finals";

				// Not needed, because individual game event in writeGameStats will cover this round
				saveToDb = false;
			} else {
				currentRoundText = `${helpers.ordinal(
					playoffSeries.currentRound + 1,
				)} round of the playoffs`;
			}

			const showPts =
				winnerPts !== undefined &&
				loserPts !== undefined &&
				numGamesToWinSeries === 1;
			const score = showPts
				? `${winnerPts}-${loserPts}`
				: `${numGamesToWinSeries}-${loserWon}`;
			const showNotification =
				series.away.tid === g.get("userTid") ||
				series.home.tid === g.get("userTid") ||
				playoffSeries.currentRound ===
					g.get("numGamesPlayoffSeries", "current").length - 1;
			logEvent(
				{
					type: "playoffs",
					text: `The <a href="${helpers.leagueUrl([
						"roster",
						`${g.get("teamInfoCache")[winnerTid]?.abbrev}_${winnerTid}`,
						g.get("season"),
					])}">${
						g.get("teamInfoCache")[winnerTid]?.name
					}</a> defeated the <a href="${helpers.leagueUrl([
						"roster",
						`${g.get("teamInfoCache")[loserTid]?.abbrev}_${loserTid}`,
						g.get("season"),
					])}">${
						g.get("teamInfoCache")[loserTid]?.name
					}</a> in the ${currentRoundText}, ${score}.`,
					showNotification,
					tids: [winnerTid, loserTid],
					score: 10,
					saveToDb,
				},
				conditions,
			);
		}
	}

	await idb.cache.playoffSeries.put(playoffSeries);
};

export default updatePlayoffSeries;
