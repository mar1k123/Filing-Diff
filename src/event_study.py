from __future__ import annotations

from datetime import datetime, timedelta
import logging
import numpy as np
from scipy import stats
import yfinance as yf

from src.models import EventStudyObservation, EventStudyResult

logger = logging.getLogger(__name__)

EXPLORATORY_WARNING = (
    "EXPLORATORY ANALYSIS ONLY — DO NOT OVER-INTERPRET: "
    "Cross-sectional correlations between 10-K/10-Q text changes and subsequent equity volatility "
    "suffer from small sample sizes, omitted variable bias (macroeconomic shocks, earnings surprises, "
    "sector beta, market-wide VIX regime shifts), and look-ahead/survivorship constraints. "
    "Statistical significance in a small cohort does not imply predictive power or causality. "
    "This module is strictly for academic/methodological exploration and is NOT financial advice."
)


def fetch_next_quarter_volatility(
    ticker: str,
    filing_date_str: str,
    trading_days: int = 63,
    annualization_factor: int = 252,
) -> float:
    """
    Downloads daily adjusted close prices via `yfinance` starting on `filing_date_str`
    and computes annualized realized volatility over the subsequent `trading_days` (~1 quarter).
    """
    start_dt = datetime.strptime(filing_date_str, "%Y-%m-%d")
    end_dt = start_dt + timedelta(days=int(trading_days * 1.65) + 15)

    hist = yf.Ticker(ticker).history(
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
        auto_adjust=True,
    )
    if hist.empty or "Close" not in hist.columns:
        raise ValueError(f"No price history returned by yfinance for {ticker} starting {filing_date_str}.")

    closes = hist["Close"].dropna().iloc[: trading_days + 1]
    if len(closes) < 15:
        raise ValueError(
            f"Insufficient post-filing trading days ({len(closes)}) for {ticker} after {filing_date_str}."
        )

    log_returns = np.log(closes / closes.shift(1)).dropna().to_numpy(dtype=np.float64)
    daily_std = float(np.std(log_returns, ddof=1))
    annualized_vol = daily_std * float(np.sqrt(annualization_factor))
    return round(annualized_vol, 4)


def evaluate_event_study(observations: list[EventStudyObservation]) -> EventStudyResult:
    """
    Computes Pearson linear correlation (r, p-value), Spearman rank correlation (rho, p-value),
    and Ordinary Least Squares (OLS) slope/intercept between `new_risk_language_ratio` and
    `next_quarter_volatility_annualized`.
    """
    n = len(observations)
    if n < 3:
        raise ValueError(f"Event study requires at least 3 ticker observations; received {n}.")

    x = np.array([obs.new_risk_language_ratio for obs in observations], dtype=np.float64)
    y = np.array([obs.next_quarter_volatility_annualized for obs in observations], dtype=np.float64)

    if np.std(x) == 0.0 or np.std(y) == 0.0:
        pearson_r, pearson_p = 0.0, 1.0
        spearman_rho, spearman_p = 0.0, 1.0
        slope, intercept = 0.0, float(np.mean(y))
    else:
        p_res = stats.pearsonr(x, y)
        s_res = stats.spearmanr(x, y)
        pearson_r, pearson_p = float(p_res.statistic), float(p_res.pvalue)
        spearman_rho, spearman_p = float(s_res.statistic), float(s_res.pvalue)
        lin = stats.linregress(x, y)
        slope, intercept = float(lin.slope), float(lin.intercept)

    return EventStudyResult(
        sample_size=n,
        pearson_r=round(pearson_r, 4),
        pearson_p_value=round(pearson_p, 4),
        spearman_rho=round(spearman_rho, 4),
        spearman_p_value=round(spearman_p, 4),
        ols_slope=round(slope, 4),
        ols_intercept=round(intercept, 4),
        observations=observations,
        methodological_warning=EXPLORATORY_WARNING,
    )
