import styles from '../form.module.css';
import {Link, useLocation, useNavigate} from "react-router-dom";
import Authentication from "../Authentication";
import {useState} from "react";
import Error from "../../../components/feedback/error/Error";
import {authLogin} from "../../../actions/auth";
import {useDispatch} from "react-redux";

const Login = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const redirectTo = location.state?.from || '/';
    const redirectMessage = location.state?.message || '';

    const [data, setData] = useState({
        email: "",
        password: ""
    });
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setData({...data, [e.target.name]: e.target.value});
    };

    const validateEmail = (email) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const handleLogin = () => {
        const {email, password} = data;

        if (!email)
            return setError("Enter your email address");
        if (!validateEmail(email))
            return setError("Enter a valid email address");
        if (!password)
            return setError("Enter your password");
        if (password.length < 6)
            return setError("Your password must be at least 6 characters long.");

        setSubmitting(true);
        setError("");

        const onSuccess = () => {
            setSubmitting(false);
            navigate(redirectTo, {replace: true});
        };

        const onError = (e) => {
            setSubmitting(false);
            setError(e.message || "Invalid email or password");
        };

        dispatch(authLogin(email, password, onSuccess, onError));
    };

    const form = (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}
            {redirectMessage && !error && (
                <div className="warning-box">
                    <span className="warning">Sign In Required: </span>
                    {redirectMessage}
                </div>
            )}

            <div className={styles['header']}>
                <h1 className={styles['title']}>Welcome back</h1>
                <div className={styles['login']}>
                    New to KijaniMart? <Link to={'/signup'}>Create an account</Link>
                </div>
            </div>

            <div className={styles['form']}>
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
                            autoComplete="email"
                        />
                    </div>
                </div>

                <div className={styles['field']}>
                    <div className={styles['label-row']}>
                        <label className={styles['label']}>Password</label>
                        <Link to={'/forgot-password'} className={styles['forgot-link']}>
                            Forgot password?
                        </Link>
                    </div>
                    <div className={styles['input-box']}>
                        <span className={`material-symbols-outlined ${styles['lead-icon']}`}>lock</span>
                        <input
                            onChange={handleChange}
                            name={'password'}
                            value={data.password}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            placeholder={'Enter your password'}
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
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
                </div>

                <button
                    type="button"
                    onClick={handleLogin}
                    disabled={submitting}
                    className={`btn1 ${styles['submit-btn']}`}
                >
                    <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
                    <span className="material-symbols-outlined">arrow_forward</span>
                </button>
            </div>
        </div>
    );

    return <Authentication data={form}/>;
};

export default Login;
