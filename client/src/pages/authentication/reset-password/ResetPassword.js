import styles from '../form.module.css';
import Authentication from "../Authentication";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useState} from "react";
import Error from "../../../components/feedback/error/Error";
import * as api from "../../../api";
import {evaluatePasswordRules} from "../signup/Signup";

const ResetPassword = () => {
    const {token} = useParams();
    const navigate = useNavigate();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const rules = evaluatePasswordRules(password);
    const passedCount = Object.values(rules).filter(Boolean).length;
    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

    const strengthMeta = [
        {label: "Too Weak", barClass: "bar-active-weak", color: "#ef4444"},
        {label: "Weak", barClass: "bar-active-weak", color: "#ef4444"},
        {label: "Fair", barClass: "bar-active-fair", color: "#f59e0b"},
        {label: "Good", barClass: "bar-active-good", color: "#3b82f6"},
        {label: "Strong", barClass: "bar-active-strong", color: "#059669"},
    ][passedCount];

    const handleReset = async () => {
        if (!rules.minLength)
            return setError("New password must be at least 8 characters long.");
        if (!rules.hasMixedCase)
            return setError("Password must include both uppercase and lowercase letters.");
        if (!rules.hasNumber)
            return setError("Password must include at least one number.");
        if (!rules.hasSpecial)
            return setError("Password must include at least one special character (e.g. !@#$%).");
        if (password !== confirmPassword)
            return setError("Passwords do not match.");

        setSubmitting(true);
        setError("");

        try {
            const res = await api.authResetPassword(token, password);
            setSuccessMessage(
                res.data?.message || "Password reset successfully! Redirecting to sign in..."
            );
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError(
                err.response?.data?.message || "Invalid or expired reset link. Please request a new one."
            );
        } finally {
            setSubmitting(false);
        }
    };

    const form = (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}
            {successMessage && (
                <div className={styles['success-box']}>
                    ✓ {successMessage}
                </div>
            )}

            <div className={styles['header']}>
                <h1 className={styles['title']}>Set a new password</h1>
                <div className={styles['login']}>
                    Choose a strong password for your KijaniMart account.
                </div>
            </div>

            <div className={styles['form']}>
                <div className={styles['field']}>
                    <label className={styles['label']}>New Password</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>lock_reset</span>
                        <input
                            onChange={(e) => setPassword(e.target.value)}
                            value={password}
                            placeholder={'Enter new password'}
                            type={showPassword ? 'text' : 'password'}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className={styles['eye-btn']}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            <span className="material-symbols-outlined">
                                {showPassword ? 'visibility_off' : 'visibility'}
                            </span>
                        </button>
                    </div>

                    {password.length > 0 && (
                        <div className={styles['password-meter']}>
                            <div className={styles['strength-header']}>
                                <span style={{color: '#64748b'}}>Password strength</span>
                                <span style={{color: strengthMeta.color}}>{strengthMeta.label}</span>
                            </div>
                            <div className={styles['strength-bars']}>
                                {[1, 2, 3, 4].map((level) => (
                                    <div
                                        key={level}
                                        className={`${styles['bar']} ${
                                            passedCount >= level ? styles[strengthMeta.barClass] : ''
                                        }`}
                                    />
                                ))}
                            </div>
                            <div className={styles['rules-grid']}>
                                <div className={`${styles['rule-item']} ${rules.minLength ? styles['rule-pass'] : ''}`}>
                                    <span className="material-symbols-outlined">
                                        {rules.minLength ? 'check_circle' : 'radio_button_unchecked'}
                                    </span>
                                    <span>8+ characters</span>
                                </div>
                                <div className={`${styles['rule-item']} ${rules.hasMixedCase ? styles['rule-pass'] : ''}`}>
                                    <span className="material-symbols-outlined">
                                        {rules.hasMixedCase ? 'check_circle' : 'radio_button_unchecked'}
                                    </span>
                                    <span>Upper & lowercase</span>
                                </div>
                                <div className={`${styles['rule-item']} ${rules.hasNumber ? styles['rule-pass'] : ''}`}>
                                    <span className="material-symbols-outlined">
                                        {rules.hasNumber ? 'check_circle' : 'radio_button_unchecked'}
                                    </span>
                                    <span>At least 1 number</span>
                                </div>
                                <div className={`${styles['rule-item']} ${rules.hasSpecial ? styles['rule-pass'] : ''}`}>
                                    <span className="material-symbols-outlined">
                                        {rules.hasSpecial ? 'check_circle' : 'radio_button_unchecked'}
                                    </span>
                                    <span>Special symbol (!@#$)</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles['field']}>
                    <label className={styles['label']}>Confirm New Password</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>verified_user</span>
                        <input
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                            value={confirmPassword}
                            placeholder={'Re-enter new password'}
                            type={showConfirmPassword ? 'text' : 'password'}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword((prev) => !prev)}
                            className={styles['eye-btn']}
                            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                            <span className="material-symbols-outlined">
                                {showConfirmPassword ? 'visibility_off' : 'visibility'}
                            </span>
                        </button>
                    </div>
                    {confirmPassword.length > 0 && (
                        <div
                            className={`${styles['match-hint']} ${
                                passwordsMatch ? styles['match-ok'] : styles['match-err']
                            }`}
                        >
                            <span className="material-symbols-outlined" style={{fontSize: '1rem'}}>
                                {passwordsMatch ? 'check_circle' : 'cancel'}
                            </span>
                            <span>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleReset}
                    disabled={submitting}
                    className={`btn1 ${styles['submit-btn']}`}
                >
                    <span>{submitting ? 'Updating Password...' : 'Update Password'}</span>
                    <span className="material-symbols-outlined">check</span>
                </button>

                <div className={styles['login']} style={{textAlign: 'center', marginTop: '0.25rem'}}>
                    <Link to={'/login'}>← Back to Sign In</Link>
                </div>
            </div>
        </div>
    );

    return <Authentication data={form}/>;
};

export default ResetPassword;
