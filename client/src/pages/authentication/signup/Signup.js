import styles from '../form.module.css';
import Authentication from "../Authentication";
import {Link, useNavigate} from "react-router-dom";
import {useState} from "react";
import Error from "../../../components/feedback/error/Error";
import {authSignup} from "../../../actions/auth";
import {useDispatch} from "react-redux";

export const evaluatePasswordRules = (password = "") => {
    return {
        minLength: password.length >= 8,
        hasMixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
};

const Signup = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [data, setData] = useState({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        confirm_password: ""
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setData({...data, [e.target.name]: e.target.value});
    };

    const rules = evaluatePasswordRules(data.password);
    const passedCount = Object.values(rules).filter(Boolean).length;
    const passwordsMatch =
        data.confirm_password.length > 0 && data.password === data.confirm_password;

    const strengthMeta = [
        {label: "Too Weak", barClass: "bar-active-weak", color: "#ef4444"},
        {label: "Weak", barClass: "bar-active-weak", color: "#ef4444"},
        {label: "Fair", barClass: "bar-active-fair", color: "#f59e0b"},
        {label: "Good", barClass: "bar-active-good", color: "#3b82f6"},
        {label: "Strong", barClass: "bar-active-strong", color: "#059669"},
    ][passedCount];

    const validateEmail = (email) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const handleSignup = () => {
        const {first_name, last_name, email, password, confirm_password} = data;

        if (!first_name.trim())
            return setError("Please enter your first name.");
        if (!last_name.trim())
            return setError("Please enter your last name.");
        if (!email.trim())
            return setError("Please enter your email address.");
        if (!validateEmail(email))
            return setError("Please enter a valid email address.");
        if (!rules.minLength)
            return setError("Password must be at least 8 characters long.");
        if (!rules.hasMixedCase)
            return setError("Password must include both uppercase and lowercase letters.");
        if (!rules.hasNumber)
            return setError("Password must include at least one number.");
        if (!rules.hasSpecial)
            return setError("Password must include at least one special character (e.g. !@#$%).");
        if (password !== confirm_password)
            return setError("Passwords do not match. Please confirm your password.");

        setSubmitting(true);
        setError("");

        const onSuccess = () => {
            setSubmitting(false);
            navigate('/');
        };

        const onError = (e) => {
            setSubmitting(false);
            setError(e.message || "Could not create account");
        };

        dispatch(authSignup(first_name.trim(), last_name.trim(), email.trim(), password, onSuccess, onError));
    };

    const form = (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}

            <div className={styles['header']}>
                <h1 className={styles['title']}>Create your account</h1>
                <div className={styles['login']}>
                    Already have an account? <Link to={'/login'}>Sign In</Link>
                </div>
            </div>

            <div className={styles['form']}>
                <div className={styles['row-2']}>
                    <div className={styles['field']}>
                        <label className={styles['label']}>First Name</label>
                        <div className={styles['input-box']}>
                            <span className={`material-symbols-outlined ${styles['lead-icon']}`}>person</span>
                            <input
                                onChange={handleChange}
                                name={'first_name'}
                                value={data.first_name}
                                placeholder={'First name'}
                                type={'text'}
                                required
                            />
                        </div>
                    </div>

                    <div className={styles['field']}>
                        <label className={styles['label']}>Last Name</label>
                        <div className={styles['input-box']}>
                            <span className={`material-symbols-outlined ${styles['lead-icon']}`}>badge</span>
                            <input
                                onChange={handleChange}
                                name={'last_name'}
                                value={data.last_name}
                                placeholder={'Last name'}
                                type={'text'}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className={styles['field']}>
                    <label className={styles['label']}>Email Address</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>mail</span>
                        <input
                            onChange={handleChange}
                            name={'email'}
                            value={data.email}
                            placeholder={'you@example.com'}
                            type={'email'}
                        />
                    </div>
                </div>

                <div className={styles['field']}>
                    <label className={styles['label']}>Password</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>lock</span>
                        <input
                            onChange={handleChange}
                            name={'password'}
                            value={data.password}
                            placeholder={'Create a strong password'}
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

                    {data.password.length > 0 && (
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
                    <label className={styles['label']}>Confirm Password</label>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>verified_user</span>
                        <input
                            onChange={handleChange}
                            name={'confirm_password'}
                            value={data.confirm_password}
                            onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                            placeholder={'Re-enter your password'}
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
                    {data.confirm_password.length > 0 && (
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
                    onClick={handleSignup}
                    disabled={submitting}
                    className={`btn1 ${styles['submit-btn']}`}
                >
                    <span>{submitting ? 'Creating Account...' : 'Create Account'}</span>
                    <span className="material-symbols-outlined">person_add</span>
                </button>
            </div>
        </div>
    );

    return <Authentication data={form}/>;
};

export default Signup;
