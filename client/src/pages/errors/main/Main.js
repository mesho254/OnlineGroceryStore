import styles from './main.module.css';
import {Link, useNavigate} from "react-router-dom";

const Main = ({code, title, message, icon = "error_outline"}) => {
    const navigate = useNavigate();

    return (
        <div className={styles['wrapper']}>
            <div className={styles['card']}>
                <div className={styles['icon-badge']}>
                    <span className="material-symbols-outlined">{icon}</span>
                </div>
                <div className={styles['code']}>{code}</div>
                <h1 className={styles['title']}>{title}</h1>
                <div className={styles['message']}>{message}</div>

                <div className={styles['actions']}>
                    <Link to={'/'} className={'btn1'}>
                        <span className="material-symbols-outlined">home</span>
                        <span>Back to Home</span>
                    </Link>
                    <Link to={'/products'} className={'btn2'}>
                        <span>Browse Products</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className={styles['back-btn']}
                    >
                        ← Go Back
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Main;
