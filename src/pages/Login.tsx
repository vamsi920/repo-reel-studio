import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/dashboard";

  useEffect(() => {
    navigate(from, { replace: true });
  }, [from, navigate]);

  return null;
};

export default Login;
