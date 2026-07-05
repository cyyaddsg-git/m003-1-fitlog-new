# Changelog

For every version pushed live, append:

version: <version>
agent: <push to live agent name>
change: <summary>

version: v3.0.0
agent: Claude
change: Major restructure - FoodLog/GymLog/Momentum renamed to Today/Planner/History. Today gets a Meal/Move logging dropdown (Move is a manual kcal entry, no AI call) and a Meal/Move/Goal heading, plus conversational follow-up on the last meal estimate (adjust portion / explain / new meal). History is now a full list grouped by month (not just the current calendar month) with Goal/Net/Move/Meal kcal and macros per day. Planner splits into Gym Plan (unchanged exercise log, now fully decoupled from kcal totals) and a Diet Plan placeholder. Fixed a long-standing mobile bug where focusing form fields triggered iOS Safari's zoom-in.

version: v2.5.1
agent: Codex
change: Increase Custom Food save limit to 1000, update Gemini model fallback for FoodLog, and rework the UserLibrary Custom Food mobile list layout.

version: gym-defaults-2026-05-29
agent: Codex
change: GymLog now adds one 12-rep set by default, uses updated starter kg values, and includes Regular Squat, Sumo Squat, Sumo Deadlift, Face Pull, and RDL aliases.

version: v2.5.0-restore-2026-05-29
agent: Codex
change: Restore the v2.5.0 rel release source, including Profile Body Composition and Monthly Health Report, while keeping GymLog exercise-default updates.
