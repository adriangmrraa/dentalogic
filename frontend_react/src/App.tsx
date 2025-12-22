import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/setup" element={<div className="view active"><h1 className="view-title">Configuración</h1><p>Próximamente...</p></div>} />
          <Route path="/stores" element={<div className="view active"><h1 className="view-title">Mis Tiendas</h1><p>Próximamente...</p></div>} />
          <Route path="/logs" element={<div className="view active"><h1 className="view-title">Live History</h1><p>Próximamente...</p></div>} />
          <Route path="/analytics" element={<div className="view active"><h1 className="view-title">Métricas Avanzadas</h1><p>Próximamente...</p></div>} />
          <Route path="/credentials" element={<div className="view active"><h1 className="view-title">Credenciales</h1><p>Próximamente...</p></div>} />
          <Route path="/ycloud" element={<div className="view active"><h1 className="view-title">WhatsApp (YCloud)</h1><p>Próximamente...</p></div>} />
          <Route path="/whatsapp-meta" element={<div className="view active"><h1 className="view-title">WhatsApp Meta API</h1><p>Próximamente...</p></div>} />
          <Route path="/tools" element={<div className="view active"><h1 className="view-title">Herramientas</h1><p>Próximamente...</p></div>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
