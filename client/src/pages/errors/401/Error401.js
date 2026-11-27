import Main from "../main/Main";
import {Link} from "react-router-dom";

const Error401 = () => {
    const user = !!localStorage.getItem('profile');
    const message = user ? (
        <>
            Your account does not have administrator permissions to view this page.
        </>
    ) : (
        <>
            You need to be signed in to view this page. Please <Link to={'/login'}>Sign In</Link> to continue.
        </>
    );

    return (
        <Main
            code={401}
            icon="lock"
            title="Access Restricted"
            message={message}
        />
    );
};

export default Error401;
