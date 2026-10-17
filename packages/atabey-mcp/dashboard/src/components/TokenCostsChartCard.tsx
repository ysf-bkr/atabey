import { ChevronDown, Info } from "lucide-react";
import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { Button } from "./ui";

interface DailyTokenPoint {
    day: string;
    date: string;
    tokens: number;
    cost: number;
    formattedTokens: string;
    formattedCost: string;
}

export function TokenCostsChartCard() {
    const { t } = useI18n();
    const [daysCount, setDaysCount] = useState<number>(7);
    const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const { data: dailyData } = useApi<{ success: boolean; data: DailyTokenPoint[] } | DailyTokenPoint[]>(
        `/finops/daily?days=${daysCount}`,
        5000
    );

    const points: DailyTokenPoint[] = Array.isArray(dailyData)
        ? dailyData
        : (dailyData && "data" in dailyData && Array.isArray(dailyData.data))
        ? dailyData.data
        : [];

    // Chart dimensions
    const width = 640;
    const height = 260;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Dynamically calculate yMax from real points
    const maxVal = Math.max(...points.map(p => p.tokens), 0);
    const yMax = maxVal > 0 ? Math.ceil(maxVal * 1.2) : 1000;
    const yTicks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

    const getX = (i: number) => {
        if (points.length <= 1) return paddingLeft + chartWidth / 2;
        return paddingLeft + i * (chartWidth / (points.length - 1));
    };

    const getY = (val: number) => {
        return paddingTop + chartHeight - (val / yMax) * chartHeight;
    };

    const buildSmoothPath = (pts: { x: number; y: number }[]) => {
        if (pts.length === 0) return "";
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i === 0 ? i : i - 1];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }
        return d;
    };

    const curvePoints = points.map((d, i) => ({ x: getX(i), y: getY(d.tokens) }));
    const curvePath = buildSmoothPath(curvePoints);

    return (
        <div className="atabey-card token-costs-card">
            <div className="atabey-card-header">
                <div className="card-title-group">
                    <h3 className="card-title">
                        {t("card.tokens.title")}
                        <span className="info-icon" title={t("token_economy.subtitle")}>
                            <Info size={14} />
                        </span>
                    </h3>
                </div>
                <div className="card-actions">
                    <div className="filter-dropdown-wrapper">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="filter-pill-btn"
                            onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                            rightIcon={<ChevronDown size={14} />}
                        >
                            <span>{daysCount === 7 ? t("card.tokens.period_7days") : t("card.tokens.period_30days")}</span>
                        </Button>
                        {showPeriodDropdown && (
                            <div className="filter-menu animate-fade-in">
                                <Button
                                    variant={daysCount === 7 ? "primary" : "ghost"}
                                    size="sm"
                                    className={daysCount === 7 ? "active w-full justify-start" : "w-full justify-start"}
                                    onClick={() => { setDaysCount(7); setShowPeriodDropdown(false); }}
                                >
                                    {t("card.tokens.period_7days")}
                                </Button>
                                <Button
                                    variant={daysCount === 30 ? "primary" : "ghost"}
                                    size="sm"
                                    className={daysCount === 30 ? "active w-full justify-start" : "w-full justify-start"}
                                    onClick={() => { setDaysCount(30); setShowPeriodDropdown(false); }}
                                >
                                    {t("card.tokens.period_30days")}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="token-chart-container">
                {points.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-400">
                        {t("card.tokens.no_data")}
                    </div>
                ) : (
                    <svg className="token-chart-svg" viewBox={`0 0 ${width} ${height}`}>
                        <defs>
                            <linearGradient id="tokenBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.1" />
                            </linearGradient>
                            <linearGradient id="tokenBarGradHover" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
                            </linearGradient>
                            <filter id="tokenCurveGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Horizontal Grid lines */}
                        {yTicks.map((tickVal, i) => {
                            const y = getY(tickVal);
                            const label = tickVal >= 1_000_000
                                ? `${(tickVal / 1_000_000).toFixed(0)}M`
                                : tickVal >= 1_000
                                ? `${(tickVal / 1_000).toFixed(0)}K`
                                : `${tickVal}`;
                            return (
                                <g key={i}>
                                    <line
                                        x1={paddingLeft}
                                        y1={y}
                                        x2={width - paddingRight}
                                        y2={y}
                                        stroke="#1e2238"
                                        strokeDasharray="4 4"
                                    />
                                    <text
                                        x={paddingLeft - 8}
                                        y={y + 4}
                                        textAnchor="end"
                                        fill="#64748b"
                                        fontSize="11"
                                    >
                                        {label}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Bars for real token volume */}
                        {points.map((d, i) => {
                            const x = getX(i);
                            const y = getY(d.tokens);
                            const barW = Math.max(8, Math.min(24, (chartWidth / points.length) * 0.4));
                            const barH = chartHeight - (y - paddingTop);
                            const isHovered = hoveredIdx === i;

                            return (
                                <g
                                    key={d.date}
                                    onMouseEnter={() => setHoveredIdx(i)}
                                    onMouseLeave={() => setHoveredIdx(null)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <rect
                                        x={x - barW / 2}
                                        y={y}
                                        width={barW}
                                        height={Math.max(2, barH)}
                                        rx={3}
                                        fill={isHovered ? "url(#tokenBarGradHover)" : "url(#tokenBarGrad)"}
                                        opacity={isHovered ? 1 : 0.85}
                                    />
                                </g>
                            );
                        })}

                        {/* Spline curve for token trend */}
                        {points.length > 1 && maxVal > 0 && (
                            <path
                                d={curvePath}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                filter="url(#tokenCurveGlow)"
                            />
                        )}

                        {/* Hovered point dot */}
                        {hoveredIdx !== null && points[hoveredIdx] && (
                            <circle
                                cx={getX(hoveredIdx)}
                                cy={getY(points[hoveredIdx].tokens)}
                                r="5"
                                fill="#38bdf8"
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        )}

                        {/* X Axis Labels */}
                        {points.map((d, i) => {
                            const x = getX(i);
                            const isHovered = hoveredIdx === i;
                            return (
                                <text
                                    key={d.date}
                                    x={x}
                                    y={height - 12}
                                    textAnchor="middle"
                                    fill={isHovered ? "#f8fafc" : "#64748b"}
                                    fontSize="11"
                                    fontWeight={isHovered ? "600" : "400"}
                                >
                                    {d.day}
                                </text>
                            );
                        })}
                    </svg>
                )}

                {/* Floating Tooltip for hovered day */}
                {hoveredIdx !== null && points[hoveredIdx] && (
                    <div
                        className="chart-tooltip animate-fade-in"
                        style={{
                            left: `${(getX(hoveredIdx) / width) * 100}%`,
                            top: `${getY(points[hoveredIdx].tokens)}px`
                        }}
                    >
                        <div className="tooltip-title">{points[hoveredIdx].day} ({points[hoveredIdx].date})</div>
                        <div className="tooltip-row">
                            <span>{t("card.tokens.tokens")}:</span>
                            <strong>{points[hoveredIdx].formattedTokens}</strong>
                        </div>
                        <div className="tooltip-row">
                            <span>{t("card.tokens.cost")}:</span>
                            <strong>{points[hoveredIdx].formattedCost}</strong>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
