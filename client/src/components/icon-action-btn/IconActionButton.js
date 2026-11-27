import {useEffect, useRef, useState} from "react";
import styles from "./iconActionButton.module.css";

/**
 * Compact square icon button with a fixed-position sibling tooltip so it escapes
 * overflow-x scrollable tables without needing a react-dom portal import.
 */
const IconActionButton = ({
    icon,
    label,
    tone = "neutral",
    onClick,
    disabled = false,
    type = "button",
}) => {
    const btnRef = useRef(null);
    const [tipPos, setTipPos] = useState(null);

    const showTooltip = () => {
        if (!btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const placeBelow = rect.top < 54;
        const centerX = rect.left + rect.width / 2;
        const clampedX = Math.max(72, Math.min(window.innerWidth - 72, centerX));
        setTipPos({
            x: clampedX,
            y: placeBelow ? rect.bottom + 8 : rect.top - 8,
            placeBelow,
        });
    };

    const hideTooltip = () => setTipPos(null);

    useEffect(() => {
        if (!tipPos) return;
        const dismiss = () => setTipPos(null);
        window.addEventListener("scroll", dismiss, true);
        window.addEventListener("resize", dismiss);
        return () => {
            window.removeEventListener("scroll", dismiss, true);
            window.removeEventListener("resize", dismiss);
        };
    }, [tipPos]);

    const toneClass = styles[`tone-${tone}`] || styles["tone-neutral"];

    return (
        <>
            <button
                ref={btnRef}
                type={type}
                disabled={disabled}
                aria-label={label}
                onClick={(e) => {
                    hideTooltip();
                    onClick?.(e);
                }}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                className={`${styles["icon-btn"]} ${toneClass}`}
            >
                <span className="material-symbols-outlined">{icon}</span>
            </button>

            {tipPos && (
                <div
                    role="tooltip"
                    className={`${styles["tooltip"]} ${
                        tipPos.placeBelow ? styles["tooltip-below"] : styles["tooltip-above"]
                    }`}
                    style={{left: `${tipPos.x}px`, top: `${tipPos.y}px`}}
                >
                    {label}
                </div>
            )}
        </>
    );
};

export default IconActionButton;
