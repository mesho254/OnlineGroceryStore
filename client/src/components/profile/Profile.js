import React, {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {logout} from "../../actions/auth";
import Loading from "../../components/loading/Loading";
import './profile.css';

function Profile() {
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const user = useSelector(state => state.authentication.user);
    const dispatch = useDispatch();
    const counter = useSelector(state => state.counter);




    useEffect(() => {
        const onSuccess = () => {
            setLoading(false);
        }
        dispatch((onSuccess))
    }, [dispatch])


    const handleLogout = () => {
        dispatch(logout);
        navigate('/login');
    }

    if (loading) 
        return <Loading/>
     
 return (
    <div>
        <div className='wrapper'>
            <div className='profile'>
                <div className='profile-img'>
                    <p className="avatar">{user.first_name[0].toUpperCase()}</p>
                    </div>

                    <div className='profile-content'>
                        <div className='profile-content-text'>
                            <h1>{user.first_name.toUpperCase()}</h1>
                            <p>{user.email}</p>
                        </div>       
                        <div className='profile-info'>
                        <div className='profile-info-item'>
                            <h1>Orders</h1>
                                <p> {counter || 0}</p>
                        </div>
                        <div className='profile-info-item'>
                            <h1>Address</h1>
                                <p>0</p>
                        </div>
                        <div className='profile-info-item'>
                            <h1>Phone</h1>
                                <p className="p">0</p>
                            <button type="submit" >add</button>
                        </div>

                    </div>
                            
                        </div>
                    
                    <div className='profile-btns'>
                                <button className={'btn1'}>Edit Profile</button>
                                <button className={'btn1'}>Change Password</button>
                                <button className={'btn1'} onClick={handleLogout}>Logout</button>
                     </div>
            </div>
        </div>

    </div>
  )
}

export default Profile
