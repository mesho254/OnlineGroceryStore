import {Link} from "react-router-dom";
import PendingReviewsSection from "../../components/pending-reviews/PendingReviewsSection";

const PendingReviewsPage = () => {
    return (
        <div style={{width: '100%', minHeight: '75vh', paddingBottom: '2rem'}}>
            <div
                style={{
                    maxWidth: '1280px',
                    margin: '0 auto',
                    padding: '1.75rem clamp(1.25rem, 3.5vw, 3rem) 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                }}
            >
                <Link
                    to="/profile"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: '#334155',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        padding: '0.45rem 0.95rem',
                        borderRadius: '999px',
                    }}
                >
                    <span className="material-symbols-outlined" style={{fontSize: '1rem'}}>
                        arrow_back
                    </span>
                    <span>Back to My Profile</span>
                </Link>
                <Link
                    to="/shipping"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: '#047857',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        padding: '0.45rem 0.95rem',
                        borderRadius: '999px',
                    }}
                >
                    <span className="material-symbols-outlined" style={{fontSize: '1rem'}}>
                        local_shipping
                    </span>
                    <span>All Orders & Shipments</span>
                </Link>
            </div>

            <PendingReviewsSection/>
        </div>
    );
};

export default PendingReviewsPage;
