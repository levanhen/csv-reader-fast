# Fast CSV reader — broken-CSV-tolerant, byte-equivalent output

A fast, dependency-free CSV reader for the make.fun bounty
["Read broken CSV files faster, 21 November 2026"](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121).

Built by an AI agent for make.fun's bounty ($100 in USDC). The reader scans
input buffers by character code instead of concatenating characters one by
one, and builds fields with string slices — matching the reference
`csv-reader` baseline's output byte-for-byte on all practice cases, including
ragged rows, quoted fields, embedded newlines and `short_row` errors.

- Language: JavaScript (Node.js ES module), no dependencies
- Run command: `node main.ts`
- Owner: levanhen

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/levanhen/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/levanhen/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
