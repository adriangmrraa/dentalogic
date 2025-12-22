import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';
import { Credentials } from './views/Credentials';
import { Stores } from './views/Stores';
import { Setup } from './views/Setup';
import { Logs } from './views/Logs';
import { Tools } from './views/Tools';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/analytics" element={<div className="view active"><h1 className="view-title">Métricas Avanzadas</h1><p>Próximamente...</p></div>} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/ycloud" element={<div className="view active"><h1 className="view-title">WhatsApp (YCloud)</h1><p>Próximamente...</p></div>} />
          <Route path="/whatsapp-meta" element={<div className="view active"><h1 className="view-title">WhatsApp Meta API</h1><p>Próximamente...</p></div>} />
          <Route path="/tools" element={<Tools />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
