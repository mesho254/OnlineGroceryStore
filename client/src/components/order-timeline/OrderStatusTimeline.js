import styles from './orderStatusTimeline.module.css';
import {
    buildTimelineEntries,
    isDeliveredStatus,
    isTerminalGreyStatus,
} from "../../utils/orderStatuses";

const formatTimelineDate = (val) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
};

const OrderStatusTimeline = ({order}) => {
    if (!order) return null;
    const entries = buildTimelineEntries(order);

    return (
        <div className={styles['timeline-card']}>
            <div className={styles['timeline-head']}>
                <h3>Order & Shipment Status History</h3>
                <span>Chronological fulfillment log</span>
            </div>

            <div className={styles['timeline']}>
                {entries.map((item, idx) => {
                    const isLast = item.isLast;
                    const isGreenFinal = isLast && isDeliveredStatus(item.status);
                    const isGreyFinal = isLast && isTerminalGreyStatus(item.status);

                    const nodeClass = isGreenFinal
                        ? styles['node-green']
                        : isGreyFinal
                        ? styles['node-grey']
                        : isLast
                        ? styles['node-active-blue']
                        : styles['node-completed-blue'];

                    const pillClass = isGreenFinal
                        ? styles['pill-green']
                        : isGreyFinal
                        ? styles['pill-grey']
                        : styles['pill-blue'];

                    return (
                        <div
                            key={`${item.status}-${idx}`}
                            className={`${styles['step']} ${isLast ? styles['step-last'] : ''}`}
                        >
                            {/* Left rail: icon circle + vertical connector */}
                            <div className={styles['rail']}>
                                <div className={`${styles['node']} ${nodeClass}`}>
                                    {isLast ? (
                                        <span className={styles['inner-dot']}/>
                                    ) : (
                                        <svg
                                            viewBox="0 0 24 24"
                                            width="14"
                                            height="14"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                    )}
                                </div>
                                {!isLast && <div className={styles['connector']}/>}
                            </div>

                            {/* Right content: Status Pill + Date + Detailed Message on final step */}
                            <div className={styles['content']}>
                                <span className={`${styles['status-pill']} ${pillClass}`}>
                                    {item.label}
                                </span>
                                <span className={styles['date-text']}>
                                    {formatTimelineDate(item.timestamp)}
                                </span>
                                {isLast && item.detailMessage && (
                                    <p className={styles['detail-msg']}>{item.detailMessage}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OrderStatusTimeline;
