"""FastAPI Router for Strategy Doctor: Robustness evaluation and walk-forward validation."""
import json
import logging

from fastapi import APIRouter, HTTPException, status
from google import genai
from google.genai import types

from ...config import settings
from ...core.exceptions import DataUnavailableError, InvalidInputError
from ...schemas.strategy_doctor import (
    StrategyDoctorRequest,
    StrategyDoctorResponse,
)
from ...services.strategy_doctor import doctor_store, strategy_doctor_service

logger = logging.getLogger("market_platform.strategy_doctor")
router = APIRouter(prefix="/strategy-doctor", tags=["Strategy Doctor"])


@router.post(
    "/analyze",
    response_model=StrategyDoctorResponse,
    status_code=status.HTTP_200_OK,
    summary="Run walk-forward validation and strategy robustness diagnostics",
)
def run_strategy_doctor_analysis(req: StrategyDoctorRequest) -> StrategyDoctorResponse:
    """Executes full quantitative diagnostic audit across historical splits, sensitivity grids, and regimes."""
    try:
        report = strategy_doctor_service.analyze_strategy(req)
        return report
    except (DataUnavailableError, InvalidInputError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except Exception as exc:
        logger.error("Error executing Strategy Doctor analysis: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while evaluating strategy robustness: {str(exc)}",
        )


@router.get(
    "/{analysis_id}",
    response_model=StrategyDoctorResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve an existing Strategy Doctor diagnostic report",
)
def get_strategy_doctor_report(analysis_id: str) -> StrategyDoctorResponse:
    """Fetches previously computed report by its unique analysis ID."""
    report = doctor_store.get(analysis_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Strategy Doctor report with ID '{analysis_id}' was not found or has expired from cache.",
        )
    return report


@router.post(
    "/{analysis_id}/explain",
    response_model=StrategyDoctorResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Gemini AI diagnostic explanation for an existing report",
)
def explain_strategy_doctor_report(analysis_id: str) -> StrategyDoctorResponse:
    """Provides grounded qualitative explanation of the already-computed robustness metrics."""
    report = doctor_store.get(analysis_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Strategy Doctor report with ID '{analysis_id}' was not found.",
        )

    # Return existing explanation if already computed
    if report.ai_explanation:
        return report

    # If Gemini API key is not configured, generate a deterministic fallback diagnostic
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        fallback_explanation = (
            f"Strategy Doctor Diagnostic Summary for {report.symbol} ({report.strategy}):\n"
            f"1. Robustness Score: {report.robustness_score.overall_score}/100 ({report.robustness_score.rating}).\n"
            f"2. Out-of-Sample Performance: Net return transitioned from {report.train_period.net_return_pct:.1f}% (Train) "
            f"to {report.test_period.net_return_pct:.1f}% (Test). "
            f"Max drawdown reached {report.test_period.max_drawdown_pct:.1f}%.\n"
            f"3. Parameter Stability: {report.sensitivity_summary.profitable_ratio_pct:.1f}% of neighboring fast/slow SMA pairs remained profitable.\n"
            f"4. Cost Sensitivity: Under 4x severe transaction friction, return is {report.cost_stress_test[-1].net_return_pct:.1f}%.\n"
            f"5. Recommendation: Verify performance across higher trade sample sizes before drawing live trading conclusions."
        )
        report.ai_explanation = fallback_explanation
        doctor_store.put(analysis_id, report)
        return report

    # Call Gemini model using Google Gen AI SDK
    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt_content = {
            "symbol": report.symbol,
            "strategy": report.strategy,
            "robustness_score": report.robustness_score.model_dump(),
            "train_period": report.train_period.model_dump(),
            "validation_period": report.validation_period.model_dump(),
            "test_period": report.test_period.model_dump(),
            "sensitivity_summary": report.sensitivity_summary.model_dump(),
            "trade_concentration": report.trade_concentration.model_dump(),
            "cost_stress_test": [p.model_dump() for p in report.cost_stress_test],
            "regimes": [r.model_dump() for r in report.regime_analysis],
            "warnings": report.warnings,
        }

        user_prompt = (
            "You are a Senior Quantitative Risk Specialist. Review this pre-computed Strategy Doctor diagnostic report:\n"
            f"{json.dumps(prompt_content, indent=2)}\n\n"
            "Instructions:\n"
            "- Explain the main weaknesses and potential overfitting in this strategy.\n"
            "- Explain why performance changed between the training and unseen test periods.\n"
            "- Detail which assumptions (e.g. transaction costs, trade sample size) matter most.\n"
            "- Highlight which findings are statistically uncertain.\n"
            "- Recommend what additional tests or risk adjustments the researcher should perform.\n"
            "- Do NOT recalculate or invent any numbers. Strictly cite the provided computed results.\n"
            "- Keep your response structured with clear headings."
        )

        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=1000,
            ),
        )

        report.ai_explanation = response.text
        doctor_store.put(analysis_id, report)
        return report

    except Exception as exc:
        logger.warning("Gemini explanation generation failed: %s. Using deterministic fallback.", exc)
        fallback_explanation = (
            f"Diagnostic Summary for {report.symbol} ({report.strategy}):\n"
            f"- Robustness Score: {report.robustness_score.overall_score}/100 ({report.robustness_score.rating})\n"
            f"- Out-of-sample return: {report.test_period.net_return_pct:.1f}% vs training: {report.train_period.net_return_pct:.1f}%\n"
            f"- Note: Gemini AI live connection was unavailable ({str(exc)[:100]}). Quantitative results remain fully verified."
        )
        report.ai_explanation = fallback_explanation
        doctor_store.put(analysis_id, report)
        return report
