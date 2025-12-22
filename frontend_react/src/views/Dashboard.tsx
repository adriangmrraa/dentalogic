import React from 'react';

export const Dashboard: React.FC = () => {
    return (
        <div className="view active">
            <h1 className="view-title">Panel General</h1>
            <div className="stats-grid">
                <div className="stat-card glass accent">
                    <span className="stat-label">Estado del Sistema</span>
                    <span className="stat-value">Activo</span>
                    <span className="stat-meta">Todos los servicios operando</span>
                </div>
                <div className="stat-card glass">
                    <span className="stat-label">Versión</span>
                    <span className="stat-value">v3.0.0</span>
                    <span className="stat-meta">React Architecture</span>
                </div>
            </div>
        </div>
    );
};
