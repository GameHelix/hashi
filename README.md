# research

Hypothesis tests on the Binance archive in `~/data/binance` (1-minute candles for every USDT pair since 2017, futures candles, open interest, funding). Each script in `hypotheses/` tests one idea and writes a table to `results/`.

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python -I hypotheses/after_move.py

Costs are round trips: 0.3% on spot (0.1% fee and 0.05% slippage per side), 0.15% on perps.
