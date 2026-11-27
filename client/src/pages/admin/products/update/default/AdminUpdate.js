import styles from './adminUpdate.module.css';
import {Link, useNavigate} from "react-router-dom";
import {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import Error from "../../../../../components/feedback/error/Error";
import Loading from "../../../../../components/loading/Loading";
import Warning from "../../../../../components/feedback/warning/Warning";
import AdminLayout from "../../../../../components/admin-layout/AdminLayout";
import {adminUpdateDatabase} from "../../../../../actions/products";

const REQUIRED_FIELDS = [
    'product_id',
    'name',
    'price',
    'image',
    'weight',
    'measurement',
    'category',
    'stock',
];

const SAMPLE_CSV = `product_id,name,price,image,weight,measurement,category,stock
FM-01,Fresh Organic Sukuma Wiki (Kale),45,https://www.themealdb.com/images/ingredients/Kale.png,500,g,Fruits and Vegetables,120
FM-02,Ripe Hass Avocados,120,https://www.themealdb.com/images/ingredients/Avocado.png,500,g,Fruits and Vegetables,85`;

const AdminUpdate = () => {
    const [file, setFile] = useState(null);
    const [data, setData] = useState('');
    const [mode, setMode] = useState('UPDATE');
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const [loading, setLoading] = useState(false);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        setData('');
        const reader = new FileReader();
        if (file != null) {
            reader.onload = () => {
                setData(String(reader.result || ''));
            };
            reader.readAsText(file);
        }
    }, [file]);

    const handleDownloadSampleCsv = () => {
        const blob = new Blob([SAMPLE_CSV], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'freshmart_products_sample.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSubmit = () => {
        if (!data || !file) return setError('Please upload a CSV file first.');
        if (!mode) return setError('Please select an update mode.');

        const headers = data.split('\n')[0].split(',');
        for (const field of REQUIRED_FIELDS) {
            let found = false;
            for (const header of headers) {
                const headerCleaned = header.trim().toLowerCase().replace(/(\r)+/, '');
                if (headerCleaned === field.toLowerCase()) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return setError(`Required column "${field}" was not found in the CSV header.`);
            }
        }

        const onSuccess = (updatedData) => {
            setLoading(false);
            if (!updatedData.length)
                return setWarning('No changes detected — database already matches the CSV file.');
            navigate('/admin/products/update/success');
        };

        const onError = (e) => {
            setError(e?.message || 'Failed to process CSV upload.');
            setLoading(false);
        };

        setLoading(true);
        dispatch(adminUpdateDatabase(data, mode, onSuccess, onError));
    };

    const parsedPreviewRows = data
        ? data
              .trim()
              .split('\n')
              .slice(1, 6)
              .map((line) => line.split(','))
        : [];

    return (
        <AdminLayout
            title="Bulk CSV Inventory Update"
            subtitle="Upload a CSV spreadsheet to batch-update product prices & stock by ID or regenerate the catalog."
            actions={
                <div className={styles['top-btns']}>
                    <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className={styles['sample-btn']}
                    >
                        <span className="material-symbols-outlined">download</span>
                        <span>Download Sample CSV</span>
                    </button>
                    <Link to="/admin?tab=inventory" className={styles['inv-btn']}>
                        Live Inventory Table →
                    </Link>
                </div>
            }
        >
            {loading && <Loading text="Updating Database" overlay={true}/>}
            {error && <Error error={error} setError={setError}/>}
            {warning && <Warning warning={warning} setWarning={setWarning}/>}

            <div className={styles['grid']}>
                {/* Left Column: Upload & Mode Selector */}
                <div className={styles['card']}>
                    <div className={styles['warn-banner']}>
                        <span className="material-symbols-outlined">warning</span>
                        <div>
                            <strong>Database Modification Notice</strong>
                            <p>
                                Batch updates apply immediately to the live MongoDB catalog. Choose{' '}
                                <em>Update Products by ID</em> for safe stock/price syncs.
                            </p>
                        </div>
                    </div>

                    <div className={styles['upload-zone']}>
                        <span className="material-symbols-outlined">upload_file</span>
                        <h3>{file ? file.name : 'Select a CSV Spreadsheet (.csv)'}</h3>
                        <p>
                            {file
                                ? `${(file.size / 1024).toFixed(1)} KB loaded • Ready to process`
                                : 'Click below to choose your product inventory CSV file'}
                        </p>
                        <input
                            onChange={(e) => setFile(e.target.files[0])}
                            type="file"
                            accept="text/csv,.csv"
                        />
                    </div>

                    <div className={styles['mode-section']}>
                        <h3>Select Update Mode</h3>
                        <div className={styles['mode-cards']}>
                            <div
                                onClick={() => setMode('UPDATE')}
                                className={`${styles['mode-card']} ${
                                    mode === 'UPDATE' ? styles['mode-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">sync</span>
                                <div>
                                    <strong>Update Products by ID (Recommended)</strong>
                                    <small>
                                        Updates matching product_id rows and inserts new ones without deleting existing items.
                                    </small>
                                </div>
                            </div>

                            <div
                                onClick={() => setMode('REGENERATE')}
                                className={`${styles['mode-card']} ${
                                    mode === 'REGENERATE' ? styles['mode-danger'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">delete_sweep</span>
                                <div>
                                    <strong>Replace Entire Catalog</strong>
                                    <small>
                                        Deletes all existing products and replaces them exclusively with the uploaded CSV rows.
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>

                    {parsedPreviewRows.length > 0 && (
                        <div className={styles['preview-box']}>
                            <h4>CSV Preview (First {parsedPreviewRows.length} rows)</h4>
                            <div className={styles['preview-scroll']}>
                                <table>
                                    <thead>
                                        <tr>
                                            {REQUIRED_FIELDS.map((h) => (
                                                <th key={h}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedPreviewRows.map((cols, idx) => (
                                            <tr key={idx}>
                                                {cols.slice(0, 8).map((c, j) => (
                                                    <td key={j}>{c}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleSubmit}
                        className={`btn1 ${styles['submit-btn']}`}
                    >
                        <span>Execute Bulk CSV Update</span>
                        <span className="material-symbols-outlined">bolt</span>
                    </button>
                </div>

                {/* Right Column: CSV Schema Reference */}
                <aside className={styles['card']}>
                    <h3>Required CSV Columns</h3>
                    <p className={styles['guide-text']}>
                        Your CSV header row must include the following 8 required column names:
                    </p>

                    <div className={styles['fields-list']}>
                        {REQUIRED_FIELDS.map((f) => (
                            <div key={f} className={styles['field-chip']}>
                                <code>{f}</code>
                            </div>
                        ))}
                    </div>

                    <div className={styles['code-sample']}>
                        <small>Example CSV Header & Row:</small>
                        <pre>{SAMPLE_CSV}</pre>
                    </div>
                </aside>
            </div>
        </AdminLayout>
    );
};

export default AdminUpdate;
