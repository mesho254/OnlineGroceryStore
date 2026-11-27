import styles from './feedback.module.css';
import {useEffect, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";

const Feedback = ({style, icon = 'error', message, setMessage}) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        setVisible(true);
        const hideTimer = setTimeout(() => {
            setVisible(false);
        }, 5000);

        const clearTimer = setTimeout(() => {
            if (setMessage) setMessage('');
        }, 5350);

        return () => {
            clearTimeout(hideTimer);
            clearTimeout(clearTimer);
        };
    }, [message, setMessage]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(() => {
            if (setMessage) setMessage('');
        }, 200);
    };

    return (
        <AnimatePresence>
            {visible && message && (
                <motion.div
                    initial={{opacity: 0, y: -14, x: '-50%'}}
                    animate={{opacity: 1, y: 0, x: '-50%'}}
                    exit={{opacity: 0, y: -14, x: '-50%'}}
                    transition={{duration: 0.22}}
                    className={styles['wrapper']}
                    style={style}
                    role="alert"
                >
                    <div className={styles['body']}>
                        <span className="material-symbols-outlined">{icon}</span>
                        <span className={styles['text']}>{message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className={styles['close-btn']}
                        aria-label="Dismiss notification"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default Feedback;
