import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { Lock, Mail, Shield, AlertCircle, CheckCircle } from 'lucide-react';

const LoginView: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('');
  const [role, setRole] = useState('professional');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      login(response.data.access_token, response.data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al iniciar sesión. Verifique sus credenciales.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await api.post('/auth/register', {
        email,
        password,
        role,
        first_name: firstName,
        last_name: "",
        google_calendar_id: role === 'professional' ? googleCalendarId : null
      });
      setMessage("Registro solicitado con éxito. Un CEO debe aprobar tu cuenta antes de que puedas ingresar.");
      setIsRegistering(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al registrarse. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass">
        <div className="login-header">
          <div className="logo-icon">
            <Shield size={32} color="var(--accent)" />
          </div>
          <h1>Dentalogic</h1>
          <p>{isRegistering ? 'Solicitud de acceso a la plataforma' : 'Bienvenido de nuevo'}</p>
        </div>

        {error && (
          <div className="auth-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="auth-alert success">
            <CheckCircle size={18} />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="auth-form">
          {isRegistering && (
            <div className="input-group">
              <label>Nombre</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Tu nombre completo"
                  required
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label>Correo Electrónico</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@clinica.com"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Contraseña</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {isRegistering && (
            <div className="input-group">
              <label>Rol solicitado</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="professional">Profesional Dental</option>
                <option value="secretary">Secretaría / Administración</option>
                <option value="ceo">Director / CEO</option>
              </select>
            </div>
          )}

          {isRegistering && role === 'professional' && (
            <div className="input-group">
              <label>Google Calendar ID</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={googleCalendarId}
                  onChange={(e) => setGoogleCalendarId(e.target.value)}
                  placeholder="ej: usuario@gmail.com o ID de calendario"
                />
              </div>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                Opcional. Puedes configurarlo después en tu perfil.
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary auth-btn" disabled={loading}>
            {loading ? 'Procesando...' : (isRegistering ? 'Solicitar Registro' : 'Ingresar')}
          </button>
        </form>

        <div className="auth-footer">
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
              setMessage(null);
            }}
          >
            {isRegistering ? '¿Ya tienes cuenta? Ingresa aquí' : '¿No tienes acceso? Solicitalo ahora'}
          </button>
        </div>
      </div>

      <style>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, #1a1a2e, #0f0f1a);
          padding: 20px;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 40px;
          border-radius: 24px;
          text-align: center;
          animation: slideUp 0.6s ease-out;
        }
        .login-header h1 {
          font-size: 2rem;
          margin: 10px 0 5px;
          color: white;
          letter-spacing: -0.5px;
        }
        .login-header p {
          color: var(--text-secondary);
          margin-bottom: 30px;
        }
        .logo-icon {
          background: rgba(var(--accent-rgb), 0.1);
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        .auth-form {
          text-align: left;
        }
        .input-group {
          margin-bottom: 20px;
        }
        .input-group label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .input-wrapper {
          position: relative;
        }
        .input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
        }
        .input-wrapper input, .input-group select {
          width: 100%;
          padding: 12px 12px 12px 40px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          transition: all 0.3s;
        }
        .input-group select {
           padding-left: 12px;
        }
        .input-wrapper input:focus {
          border-color: var(--accent);
          background: rgba(255, 255, 255, 0.08);
          outline: none;
        }
        .auth-btn {
          width: 100%;
          padding: 14px;
          font-weight: 600;
          margin-top: 10px;
        }
        .auth-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 0.9rem;
          text-align: left;
        }
        .auth-alert.error {
          background: rgba(255, 77, 77, 0.1);
          border: 1px solid rgba(255, 77, 77, 0.2);
          color: #ff4d4d;
        }
        .auth-alert.success {
          background: rgba(77, 255, 140, 0.1);
          border: 1px solid rgba(77, 255, 140, 0.2);
          color: #4dff8c;
        }
        .btn-link {
          background: none;
          border: none;
          color: #4da6ff; /* Higher contrast blue */
          font-size: 0.95rem;
          cursor: pointer;
          margin-top: 20px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s;
        }
        .btn-link:hover {
          color: white;
          text-decoration: underline;
        }
        .input-group select option {
          background: #1a1a2e;
          color: white;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default LoginView;
