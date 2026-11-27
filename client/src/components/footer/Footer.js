import styles from './footer.module.css';
import Logo from '../../shared/assets/kijanimart-logo.svg';
import {Link} from "react-router-dom";

const Footer = () => {
    return (
        <footer className={styles['wrapper']}>
            <div className={styles['top-wrapper']}>
                <div className={styles['brand-col']}>
                    <Link to={'/'} className={styles['brand-lockup']}>
                        <div className={styles['logo-badge']}>
                            <img src={Logo} alt={'KijaniMart Grocery'}/>
                        </div>
                        <div>
                            <span className={styles['brand-name']}>KijaniMart</span>
                            <span className={styles['brand-tag']}>20-Min Express Grocery</span>
                        </div>
                    </Link>
                    <p className={styles['brand-desc']}>
                        Farm-fresh organic vegetables, prime meats, dairy, and everyday essentials delivered to your doorstep across Nairobi in 20 minutes.
                    </p>
                    <div className={styles['trust-badges']}>
                        <span>⚡ 20-Min Delivery</span>
                        <span>🌿 100% Farm Fresh</span>
                        <span>🔒 Stripe Secured</span>
                    </div>
                </div>

                <div className={styles['pages-wrapper']}>
                    <div className={styles['pages']}>
                        <div className={styles['page-title']}>Fresh Aisles</div>
                        <div className={styles['pages-list']}>
                            <Link to={'/products?category=Fruits%20and%20Vegetables'}>Fruits & Vegetables</Link>
                            <Link to={'/products?category=Meat%20Poultry%20and%20Seafood'}>Meat, Poultry & Seafood</Link>
                            <Link to={'/products?category=Dairy%20and%20Eggs'}>Dairy & Eggs</Link>
                            <Link to={'/products?category=Beverages'}>Beverages & Juices</Link>
                            <Link to={'/products'}>View All 50+ Products</Link>
                        </div>
                    </div>

                    <div className={styles['pages']}>
                        <div className={styles['page-title']}>Customer Care</div>
                        <div className={styles['pages-list']}>
                            <Link to={'/orders'}>Track Your Order</Link>
                            <Link to={'/shipping'}>Track Delivery</Link>
                            <Link to={'/cart'}>Shopping Cart</Link>
                            <Link to={'/wishlist'}>Saved Wishlist</Link>
                            <Link to={'/privacy'}>Privacy &amp; Cookie Notice</Link>
                        </div>
                    </div>

                    <div className={styles['pages']}>
                        <div className={styles['page-title']}>Account & Dev</div>
                        <div className={styles['pages-list']}>
                            <Link to={'/login'}>Sign In</Link>
                            <Link to={'/signup'}>Create Account</Link>
                            <Link to={'/forgot-password'}>Reset Password</Link>
                            <a href={'/seller'} target={'_blank'} rel={'noopener noreferrer'}>
                                Seller Portal ↗
                            </a>
                            <a href={'https://github.com/mesho254'} target={'_blank'} rel={'noreferrer'}>
                                GitHub Repository ↗
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles['credits']}>
                <span>© {new Date().getFullYear()} KijaniMart Online Grocery Store • Built by Mesho-254</span>
                <span>Nairobi, Kenya • KES</span>
            </div>
        </footer>
    );
};

export default Footer;
