import Feedback from "../Feedback";

const Error = ({error, setError}) => {
    const style = {
        background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.22)',
    };

    return <Feedback style={style} icon="error" message={error} setMessage={setError}/>;
};

export default Error;
