import styles from '../form.module.css';
import Authentication from "../Authentication";
import {Link,useNavigate} from "react-router-dom";
import {useState} from "react";
import Error from "../../../components/feedback/error/Error";
import {authSignup} from "../../../actions/auth";
import {useDispatch} from "react-redux";


const Signup = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [data, setData] = useState({
        first_name: "",
        last_name:"",
        email: "",
        password: ""
    });

    const [error, setError] = useState("");

    const handleChange = (e) => {
        setData({...data, [e.target.name]: e.target.value});
    }

    const handleSignup = () => {
        const {first_name,last_name,email, password } = data;

        if(!first_name)
        return setError("Enter your Firstname");

        if (!last_name)
        return setError("Enter your lastname");

        if (!email)
            return setError("Enter an email address");

        if (!password)
            return setError("Enter a password");

        if (!validateEmail(email))
            return setError("Enter a valid email address");

        if (password.length < 6)
            return setError("Your password must be at least 6 characters long.");

        const onSuccess = () => {
            navigate('/');
        }

        const onError = (e) => {
            setError(e.message);
        }

        dispatch(authSignup(first_name, last_name, email, password, onSuccess, onError));
    }

    const validateEmail = (email) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };


    const form =
        <div className={styles['wrapper']}>
             {error && <Error error={error} setError={setError}/>}
            <div className={styles['header']}>
                <div className={styles['title']}>Sign up with your email</div>
                <div className={styles['login']}>Already have an account? <Link to={'/login'}>Login</Link></div>
            </div>
            <div className={styles['form']}>
                <input onChange={(e)=> handleChange(e)} name={'first_name'} value={data.first_name} placeholder={'First Name'} type={'text'} required/>
                <input onChange={(e)=> handleChange(e)} name={'last_name'} value={data.last_name} placeholder={'Last Name'} type={'text'}/>
                <input onChange={(e) => handleChange(e)} name={'email'} value={data.email} placeholder={'Email'} type={'email'}/>
                <input onChange={(e)=> handleChange(e)} name={'password'} value={data.password} placeholder={'Password'} type={'password'}/>
                <button onClick={handleSignup} className={'btn1'}>Sign Up</button>
            </div>
        </div>

    return <Authentication data={form}/>
}

export default Signup;