import styles from '../form.module.css';
import Authentication from "../Authentication";
import {Link} from "react-router-dom";
import {useState} from "react";
import Error from "../../../components/feedback/error/Error";
import * as api from "../../../api";

const ForgotPassword = () => {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const validateEmail = (value) => {
        return String(value)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const handleSubmit = async () => {
        if (!email.trim()) {
            return setError("Please enter your email address.");
        }
        if (!validateEmail(email.trim())) {
            return setError("Please enter a valid email address.");
        }

        setSubmitting(true);
        setError("");
        setSuccessMessage("");

        try {
            const res = await api.authForgotPassword(email.trim());
            setSuccessMessage(
                res.data?.message || "A password reset link has been sent to your email address."
            );
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to send password reset link. Please try again."
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
                <h1 className={styles['title']}>Forgot your password?</h1>
                <div className={styles['login']}>
                    Enter your registered email and we will send you a secure reset link.
                </div>
            </div>

            <div className={styles['form']}>
                <div className={styles['field']}>
                    <label className={styles['label']}>Email Address</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>mail</span>
                        <input
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            name={'email'}
                            value={email}
                            placeholder={'Enter your account email'}
                            type={'email'}
                        />
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={`btn1 ${styles['submit-btn']}`}
                >
                    <span>{submitting ? 'Sending Reset Link...' : 'Send Reset Link'}</span>
                    <span className="material-symbols-outlined">send</span>
                </button>

                <div className={styles['login']} style={{textAlign: 'center', marginTop: '0.25rem'}}>
                    Remembered your password? <Link to={'/login'}>Back to Sign In</Link>
                </div>
            </div>
        </div>
    );

    return <Authentication data={form}/>;
};

export default ForgotPassword;
