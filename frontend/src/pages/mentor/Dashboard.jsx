import { Navigate, useLocation } from 'react-router-dom';
import Teams from '../student/Teams';
import { useStudentAccountAuth } from '../../lib/studentAccountAuth';
export default function MentorDashboard() {
 const {isAuthenticated,role}=useStudentAccountAuth();const location=useLocation();
 if(!isAuthenticated)return <Navigate to="/signin" replace state={{from:location}}/>;
 if(role!=='mentor')return <Navigate to="/dashboard" replace/>;
 return <Teams mentor/>;
}
