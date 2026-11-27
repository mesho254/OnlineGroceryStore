import styles from './tablePagination.module.css';

const DEFAULT_ROW_OPTIONS = [5, 10, 15, 25, 50];

const TablePagination = ({
    totalItems = 0,
    currentPage = 1,
    rowsPerPage = 5,
    onPageChange,
    onRowsPerPageChange,
    rowOptions = DEFAULT_ROW_OPTIONS,
    itemLabel = 'entries',
}) => {
    const safeRows = Math.max(1, Number(rowsPerPage) || 5);
    const totalPages = Math.max(1, Math.ceil(totalItems / safeRows));
    const safePage = Math.min(totalPages, Math.max(1, Number(currentPage) || 1));

    const startItem = totalItems === 0 ? 0 : (safePage - 1) * safeRows + 1;
    const endItem = Math.min(totalItems, safePage * safeRows);

    const getVisiblePages = () => {
        const pages = [];
        const maxButtons = 5;
        let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (end - start + 1 < maxButtons) {
            start = Math.max(1, end - maxButtons + 1);
        }
        for (let p = start; p <= end; p++) {
            pages.push(p);
        }
        return pages;
    };

    const visiblePages = getVisiblePages();

    return (
        <div className={styles['bar']}>
            <div className={styles['left']}>
                <div className={styles['rows-selector']}>
                    <label>Rows per page:</label>
                    <select
                        value={safeRows}
                        onChange={(e) => {
                            const nextRows = Number(e.target.value) || 5;
                            if (onRowsPerPageChange) onRowsPerPageChange(nextRows);
                            if (onPageChange) onPageChange(1);
                        }}
                    >
                        {rowOptions.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt} rows
                            </option>
                        ))}
                    </select>
                </div>

                <span className={styles['info']}>
                    Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of{' '}
                    <strong>{totalItems}</strong> {itemLabel}
                </span>
            </div>

            <div className={styles['controls']}>
                <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => onPageChange && onPageChange(1)}
                    className={styles['nav-btn']}
                    title="First Page"
                    aria-label="First Page"
                >
                    «
                </button>
                <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => onPageChange && onPageChange(safePage - 1)}
                    className={styles['nav-btn']}
                    title="Previous Page"
                    aria-label="Previous Page"
                >
                    ‹ Prev
                </button>

                <div className={styles['page-nums']}>
                    {visiblePages[0] > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={() => onPageChange && onPageChange(1)}
                                className={styles['page-btn']}
                            >
                                1
                            </button>
                            {visiblePages[0] > 2 && <span className={styles['ellipsis']}>…</span>}
                        </>
                    )}

                    {visiblePages.map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => onPageChange && onPageChange(p)}
                            className={`${styles['page-btn']} ${
                                p === safePage ? styles['page-active'] : ''
                            }`}
                        >
                            {p}
                        </button>
                    ))}

                    {visiblePages[visiblePages.length - 1] < totalPages && (
                        <>
                            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                                <span className={styles['ellipsis']}>…</span>
                            )}
                            <button
                                type="button"
                                onClick={() => onPageChange && onPageChange(totalPages)}
                                className={styles['page-btn']}
                            >
                                {totalPages}
                            </button>
                        </>
                    )}
                </div>

                <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => onPageChange && onPageChange(safePage + 1)}
                    className={styles['nav-btn']}
                    title="Next Page"
                    aria-label="Next Page"
                >
                    Next ›
                </button>
                <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => onPageChange && onPageChange(totalPages)}
                    className={styles['nav-btn']}
                    title="Last Page"
                    aria-label="Last Page"
                >
                    »
                </button>
            </div>
        </div>
    );
};

export default TablePagination;
