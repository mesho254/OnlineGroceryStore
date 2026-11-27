import {useEffect, useState} from "react";
import styles from "./confirmActionModal.module.css";

const ConfirmActionModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    subtitle = "",
    description = "",
    policyTitle = "",
    policyPoints = [],
    variant = "danger",
    icon = "warning",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    showReasonInput = false,
    reasonLabel = "Reason (optional)",
    reasonPlaceholder = "Add an audit note or reason...",
    requirePassword = false,
    passwordLabel = "Confirm with your current password *",
    loading = false,
    error = "",
}) => {
    const [reason, setReason] = useState("");
    const [password, setPassword] = useState("");
    const [localError, setLocalError] = useState("");

    useEffect(() => {
        if (isOpen) {
            setReason("");
            setPassword("");
            setLocalError("");
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === "Escape" && !loading) {
                onClose?.();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, loading, onClose]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (requirePassword && !password.trim()) {
            setLocalError("Please enter your current password to continue.");
            return;
        }
        setLocalError("");
        onConfirm?.({reason: reason.trim(), password});
    };

    const variantClass =
        variant === "warning"
            ? styles["variant-warning"]
            : variant === "primary"
            ? styles["variant-primary"]
            : styles["variant-danger"];

    return (
        <div
            className={styles["backdrop"]}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            onClick={() => !loading && onClose?.()}
        >
            <div
                className={`${styles["modal"]} ${variantClass}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles["header"]}>
                    <div className={styles["icon-wrap"]}>
                        <span className="material-symbols-outlined">{icon}</span>
                    </div>
                    <div className={styles["head-text"]}>
                        <h3 id="confirm-modal-title">{title}</h3>
                        {subtitle && <p className={styles["subtitle"]}>{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        className={styles["close-btn"]}
                        onClick={() => !loading && onClose?.()}
                        aria-label="Close modal"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles["body"]}>
                    {description && <p className={styles["description"]}>{description}</p>}

                    {(policyTitle || policyPoints.length > 0) && (
                        <div className={styles["policy-box"]}>
                            {policyTitle && (
                                <div className={styles["policy-title"]}>
                                    <span className="material-symbols-outlined">policy</span>
                                    <strong>{policyTitle}</strong>
                                </div>
                            )}
                            {policyPoints.length > 0 && (
                                <ul className={styles["policy-list"]}>
                                    {policyPoints.map((pt, idx) => (
                                        <li key={idx}>{pt}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {showReasonInput && (
                        <div className={styles["field"]}>
                            <label htmlFor="confirm-modal-reason">{reasonLabel}</label>
                            <textarea
                                id="confirm-modal-reason"
                                rows={2}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={reasonPlaceholder}
                                disabled={loading}
                            />
                        </div>
                    )}

                    {requirePassword && (
                        <div className={styles["field"]}>
                            <label htmlFor="confirm-modal-password">{passwordLabel}</label>
                            <input
                                id="confirm-modal-password"
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (localError) setLocalError("");
                                }}
                                placeholder="Enter your current password"
                                autoComplete="current-password"
                                disabled={loading}
                                required
                            />
                        </div>
                    )}

                    {(localError || error) && (
                        <div className={styles["error-banner"]}>
                            <span className="material-symbols-outlined">error</span>
                            <span>{localError || error}</span>
                        </div>
                    )}

                    <div className={styles["footer"]}>
                        <button
                            type="button"
                            className={styles["cancel-btn"]}
                            onClick={() => !loading && onClose?.()}
                            disabled={loading}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="submit"
                            className={styles["confirm-btn"]}
                            disabled={loading}
                        >
                            {loading ? "Processing..." : confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmActionModal;
