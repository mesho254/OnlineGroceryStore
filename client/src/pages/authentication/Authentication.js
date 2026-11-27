import styles from './authentication.module.css';
import Logo from '../../shared/assets/kijanimart-logo.svg';
import {Link} from "react-router-dom";

const Authentication = ({data}) => {
    return (
        <div className={styles['wrapper']}>
            <div className={styles['auth-card']}>
                <div className={styles['brand-bar']}>
                    <Link to="/" className={styles['brand-link']}>
                        <div className={styles['logo-box']}>
                            <img src={Logo} alt="KijaniMart"/>
                        </div>
                        <div>
                            <span className={styles['brand-title']}>KijaniMart</span>
                            <span className={styles['brand-sub']}>20-Min Express Grocery</span>
                        </div>
                    </Link>
                </div>
                <div className={styles['form']}>
                    {data}
                </div>
            </div>
        </div>
    );
};

export default Authentication;
