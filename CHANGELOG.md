# Changelog

For every version pushed live, append:

version: <version>
agent: <push to live agent name>
change: <summary>

version: v2.5.2
agent: Claude
change: FoodLog renamed to DailyLog, GymLog renamed to GymPlanner. Added a KOALA MOVE section above KOALA TABLE to log active kcal directly (no AI call). Daily heading now shows Goal / Eat / Move as plain info (no over/under calculation or bar). Koala Stomach meal rows now show kcal on the right with macros below, matching item rows. Momentum's active-day kcal now sources from DailyLog's own Move entries instead of GymPlanner data.

version: v2.5.1
agent: Codex
change: Increase Custom Food save limit to 1000, update Gemini model fallback for FoodLog, and rework the UserLibrary Custom Food mobile list layout.

version: gym-defaults-2026-05-29
agent: Codex
change: GymLog now adds one 12-rep set by default, uses updated starter kg values, and includes Regular Squat, Sumo Squat, Sumo Deadlift, Face Pull, and RDL aliases.

version: v2.5.0-restore-2026-05-29
agent: Codex
change: Restore the v2.5.0 rel release source, including Profile Body Composition and Monthly Health Report, while keeping GymLog exercise-default updates.
