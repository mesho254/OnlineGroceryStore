import FruitsAndVegetables from '../../shared/assets/categories/fruits_vegetables.png';
import MeatPoultrySeafood from '../../shared/assets/categories/meat_poultry_seafood.png';
import Breakfast from '../../shared/assets/categories/breakfast.png';
import ChocolateCandy from '../../shared/assets/categories/chocolate_candy.png';
import DairyEggs from '../../shared/assets/categories/dairy_eggs.png';
import ColdDrinks from '../../shared/assets/categories/cold.png';
import Snacks from '../../shared/assets/categories/snacks.png';
import IceCream from '../../shared/assets/categories/icecream.png';
import All from '../../shared/assets/categories/all.png';
import styles from './categories.module.css';
import {Link, useLocation} from "react-router-dom";

const Categories = () => {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const activeCategory = searchParams.get('category') || 'All';
    const isFlashFilter = searchParams.get('flash') === 'true';

    const categories = [
        {
            display: "All",
            subtitle: "50+ Items",
            img: All,
            tint: "#ecfdf5",
            border: "#a7f3d0"
        },
        {
            display: "Fruits and Vegetables",
            subtitle: "Farm Fresh",
            img: FruitsAndVegetables,
            tint: "#f0fdf4",
            border: "#bbf7d0"
        },
        {
            display: "Meat Poultry and Seafood",
            subtitle: "Prime Cuts",
            img: MeatPoultrySeafood,
            tint: "#fff1f2",
            border: "#fecdd3"
        },
        {
            display: "Dairy and Eggs",
            subtitle: "Daily Fresh",
            img: DairyEggs,
            tint: "#eff6ff",
            border: "#bfdbfe"
        },
        {
            display: "Breakfast",
            subtitle: "Morning Staples",
            img: Breakfast,
            tint: "#fffbeb",
            border: "#fde68a"
        },
        {
            display: "Beverages",
            subtitle: "Juices & Coffee",
            img: ColdDrinks,
            tint: "#f0f9ff",
            border: "#bae6fd"
        },
        {
            display: "Chocolate and Candy",
            subtitle: "Sweet Treats",
            img: ChocolateCandy,
            tint: "#fdf4ff",
            border: "#f5d0fe"
        },
        {
            display: "Chips and Crackers",
            subtitle: "Crispy Snacks",
            img: Snacks,
            tint: "#fff7ed",
            border: "#fed7aa"
        },
        {
            display: "Ice Cream",
            subtitle: "Frozen Gelato",
            img: IceCream,
            tint: "#fdf2f8",
            border: "#fbcfe8"
        }
    ];

    return (
        <div className={styles['categories']}>
            <div className={styles['categories-scroll']}>
                {categories.map((item, i) => {
                    const isSelected = activeCategory === item.display;
                    return (
                        <Link
                            key={i}
                            to={`/products?category=${encodeURIComponent(item.display)}${
                                isFlashFilter ? '&flash=true' : ''
                            }`}
                            style={{
                                '--CARD_TINT': item.tint,
                                '--CARD_BORDER': item.border
                            }}
                            className={`${styles['category']} ${isSelected ? styles['category-active'] : ''}`}
                        >
                            <div className={styles['icon-bubble']}>
                                <img src={item.img} alt={item.display}/>
                            </div>
                            <div className={styles['category-meta']}>
                                <span className={styles['category-title']}>{item.display}</span>
                                <small className={styles['category-sub']}>{item.subtitle}</small>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default Categories;
