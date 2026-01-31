import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';
import AgendaView from './views/AgendaView';
import PatientsView from './views/PatientsView';
import PatientDetail from './views/PatientDetail';
import ProfessionalsView from './views/ProfessionalsView';
import ChatsView from './views/ChatsView';
import TreatmentsView from './views/TreatmentsView';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agenda" element={<AgendaView />} />
          <Route path="/pacientes" element={<PatientsView />} />
          <Route path="/pacientes/:id" element={<PatientDetail />} />
          <Route path="/chats" element={<ChatsView />} />
          <Route path="/profesionales" element={<ProfessionalsView />} />
          <Route path="/tratamientos" element={<TreatmentsView />} />
          <Route path="/configuracion" element={<div className="p-6"><h1 className="text-2xl font-bold">Configuración</h1><p className="text-gray-500">Próximamente...</p></div>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
