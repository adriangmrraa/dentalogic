// Auto-detect API_BASE from current location (subdomain inference for self-hosted deployments)
function detectApiBase() {
    const currentLocation = window.location;

    // If explicitly set via window.API_BASE, use it
    if (window.API_BASE) return window.API_BASE;

    // For localhost/development
    if (currentLocation.hostname === 'localhost' || currentLocation.hostname === '127.0.0.1') {
        return `${currentLocation.protocol}//${currentLocation.hostname}:8000`;
    }

    // For production: infer api URL
    // Examples: 
    // - domain.com -> api.domain.com
    // - platform-ui.domain.com -> orchestrator-service.domain.com
    // - docker-platform-ui.host.com -> docker-orchestrator-service.host.com

    let hostname = currentLocation.hostname;
    let apiHostname = hostname;

    if (hostname.includes('platform-ui')) {
        apiHostname = hostname.replace('platform-ui', 'orchestrator-service');
    } else if (hostname.startsWith('ui.')) {
        apiHostname = hostname.replace('ui.', 'api.');
    } else {
        // Fallback for custom domains: assume 'api.' prefix if not found
        apiHostname = `api.${hostname}`;
    }

    return `${currentLocation.protocol}//${apiHostname}`;
}

const API_BASE = detectApiBase();
const ADMIN_TOKEN = window.ADMIN_TOKEN || "admin-secret-99"; // ← Asegúrate de que coincida con tu env

console.log('API_BASE detected:', API_BASE);
console.log('Current location:', window.location.href);

let currentView = 'overview';
let activeChatId = null;
let allChats = []; // Global store for chat metadata
let renderedMessageIds = new Set();
let pollingInterval = null;

// Navigation
function showView(viewId, event = null) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Reset mobile chat layout if switching views
    const layout = document.querySelector('.chats-layout');
    if (layout) layout.classList.remove('mobile-chat-active');


    document.getElementById(`view-${viewId}`).classList.add('active');

    // Add active class to clicked element if event provided
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // For programmatic calls, find and activate the corresponding nav item
        const navItem = document.querySelector(`[onclick*="showView('${viewId}')"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
    }

    currentView = viewId;

    if (viewId === 'stores') loadTenants();
    if (viewId === 'logs') loadLogs();
    if (viewId === 'credentials') {
        loadCredentials();
        loadCredentialFilters();
    }
    if (viewId === 'tools') {
        loadTools();
        initHandoffConfig();
    }
    if (viewId === 'analytics') loadAnalytics();
    if (viewId === 'console') loadConsoleEvents();
    if (viewId === 'chats') loadChats();
}

// Modal handling
function openModal(id) {
    document.getElementById(id).style.display = 'flex';

    if (id === 'ycloud-config-modal') {
        loadTenantSelector('ycloud-tenant-select').then(() => {
            loadYCloudConfig();
        });
    }
    if (id === 'whatsapp-meta-modal') {
        loadTenantSelector('whatsapp-meta-tenant-select').then(() => {
            loadMetaConfig();
        });
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function handleModalClick(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
        if (modalId === 'cred-modal') {
            resetCredentialModal();
        }
    }
}

function showNotification(success, title, message) {
    const icon = success ? '✅' : '❌';
    document.getElementById('notification-icon').textContent = icon;
    document.getElementById('notification-title').textContent = title;
    document.getElementById('notification-message').textContent = message;
    openModal('notification-modal');
}

// Data Fetching
async function adminFetch(endpoint, method = 'GET', body = null, tenantId = null) {
    const headers = {
        'x-admin-token': ADMIN_TOKEN,
        'Content-Type': 'application/json'
    };

    // Add tenant header if provided
    if (tenantId) {
        headers['x-tenant-id'] = tenantId;
    }

    // Add HMAC signature for sensitive endpoints
    if (endpoint.includes('/whatsapp-meta') && method !== 'GET') {
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyStr = body ? JSON.stringify(body) : '';
        const payload = `${timestamp}.${bodyStr}`;
        // Note: In production, this would need crypto libraries for proper HMAC
        // For now, we'll rely on HTTPS and internal network security
        headers['x-signature'] = `t=${timestamp},s=dummy_signature`;
    }

    const options = {
        method,
        headers,
        credentials: 'include', // Ensure cookies/headers are sent for CORS
    };
    if (body) options.body = JSON.stringify(body);

    console.log(`🔗 API Call: ${method} ${API_BASE}${endpoint}`); // Debug log
    if (body) console.log('📤 Request Body:', body); // Debug log

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        console.log(`Response status: ${response.status}`); // Debug log

        if (!response.ok) {
            // Try to get error message from response
            let errorText = response.statusText;
            let errorData = '';
            try {
                errorData = await response.text();
                console.log('Error response body:', errorData);
                // Try to parse as JSON
                const errorJson = JSON.parse(errorData);
                errorText = errorJson.detail || errorJson.message || errorJson.error || errorText;
            } catch (parseError) {
                // If not JSON, use text
                if (errorData) errorText = errorData;
            }
            const error = new Error(`HTTP ${response.status}: ${errorText}`);
            error.response = response;
            error.responseText = errorData;
            throw error;
        }

        // Check content type
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('Response data:', data); // Debug log
            return data;
        } else {
            // Handle non-JSON responses
            const text = await response.text();
            console.log('Response text:', text);
            return { status: 'ok', message: text }; // Fallback
        }
    } catch (e) {
        console.error("Fetch Error:", e);
        throw e; // Re-throw to catch in handlers
    }
}

// Health Strip Update from Diagnostics
function updateHealthStripFromDiagnostics(healthData) {
    const services = {
        'orchestrator': 'orchestrator-status',
        'whatsapp_service': 'whatsapp-status',
        'tiendanube_service': 'tiendanube-status',
        'database': 'database-status',
        'redis': 'redis-status'
    };

    if (healthData.checks) {
        healthData.checks.forEach(check => {
            const elementId = services[check.name];
            if (elementId) {
                const element = document.getElementById(elementId);
                element.classList.remove('ok', 'error', 'warning');

                if (check.status === 'OK') {
                    element.classList.add('ok');
                } else if (check.status === 'FAIL') {
                    element.classList.add('error');
                } else {
                    element.classList.add('warning');
                }
            }
        });
    }
}

// Dashboard Stats
async function updateStats() {
    let stats = null;
    let health = null;
    let bootstrap = null;

    try {
        stats = await adminFetch('/admin/stats');
    } catch (error) {
        console.warn('Failed to fetch stats:', error);
        showNotification(false, 'Error de Estadísticas', 'No se pudieron cargar las estadísticas del sistema');
    }

    try {
        health = await adminFetch('/admin/diagnostics/healthz');
    } catch (error) {
        console.warn('Failed to fetch health:', error);
        showNotification(false, 'Error de Salud', 'No se pudieron cargar los indicadores de salud');
    }

    try {
        bootstrap = await adminFetch('/admin/bootstrap');
    } catch (error) {
        console.warn('Bootstrap failed, continuing with health and stats:', error);
        showNotification(false, 'Error de Bootstrap', 'No se pudieron cargar datos de bootstrap, continuando con indicadores básicos');
        // Continue without bootstrap data
    }

    if (stats) {
        document.getElementById('stat-active-tenants').innerText = stats.active_tenants || 0;
        document.getElementById('stat-total-messages').innerText = stats.total_messages || 0;

        const rate = stats.total_messages > 0
            ? Math.round((stats.processed_messages / stats.total_messages) * 100)
            : 0;
        document.getElementById('stat-success-rate').innerText = `${rate}%`;
    }

    if (health) {
        // Update health strip with detailed service checks
        updateHealthStripFromDiagnostics(health);
    }

    if (bootstrap) {
        // Update last signals
        const lastInbound = bootstrap.last_inbound_at ?
            new Date(bootstrap.last_inbound_at).toLocaleString() : 'Nunca';
        const lastOutbound = bootstrap.last_outbound_at ?
            new Date(bootstrap.last_outbound_at).toLocaleString() : 'Nunca';

        document.getElementById('last-inbound').textContent = lastInbound;
        document.getElementById('last-outbound').textContent = lastOutbound;

        // Update version
        if (bootstrap.version) {
            document.getElementById('version-badge').textContent = `v${bootstrap.version}`;
        }

        // Update activity widgets
        const tenantsStatus = bootstrap.tenants_count > 0 ?
            `${bootstrap.tenants_count} tenants configurados` :
            'No hay tenants configurados';
        document.getElementById('tenants-status').textContent = tenantsStatus;
        document.getElementById('tenants-status').className = bootstrap.tenants_count > 0 ? 'alert-item success' : 'alert-item warning';
    } else {
        // Bootstrap failed, set defaults
        document.getElementById('last-inbound').textContent = 'Desconocido';
        document.getElementById('last-outbound').textContent = 'Desconocido';
        document.getElementById('version-badge').textContent = 'v?';
        document.getElementById('tenants-status').textContent = 'Estado desconocido';
        document.getElementById('tenants-status').className = 'alert-item warning';
    }
}

// Tenants Management
async function loadTenants() {
    const tenants = await adminFetch('/admin/tenants');
    const container = document.getElementById('tenants-list');
    container.innerHTML = '';

    if (tenants) {
        tenants.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600">${t.store_name}</div>
                    <div style="font-size: 11px; color: #a1a1aa">${t.owner_email || 'No email'}</div>
                </td>
                <td>${t.bot_phone_number}</td>
                <td>${t.tiendanube_store_id || 'N/A'}</td>
                <td><span class="status-badge ${t.tiendanube_store_id ? 'ok' : 'error'}" style="background: ${t.tiendanube_store_id ? 'rgba(0,230,118,0.1)' : 'rgba(244,67,54,0.1)'}; color: ${t.tiendanube_store_id ? '#00e676' : '#f44336'}">${t.tiendanube_store_id ? 'Activo' : 'Sin Configurar'}</span></td>
                <td>
                    <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px" onclick="editTenant('${t.bot_phone_number}')">Editar</button>
                    <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px" onclick="testTenantConnection('${t.bot_phone_number}', '${t.tiendanube_store_id}', '${t.tiendanube_access_token}')">Test</button>
                    <button class="btn-delete" style="padding: 5px 12px; font-size: 12px" onclick="deleteTenant('${t.bot_phone_number}')">Eliminar</button>
                </td>
            `;
            container.appendChild(tr);
        });
    }
}

// Live Logs
async function loadLogs() {
    const logs = await adminFetch('/admin/logs');
    const container = document.getElementById('logs-list');

    if (logs) {
        container.innerHTML = '';
        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';

            const time = new Date(log.received_at).toLocaleTimeString();
            let payloadText = "";
            try {
                const p = JSON.parse(log.payload);
                payloadText = p.text || "Mensaje sin texto";
            } catch (e) { payloadText = log.payload; }

            entry.innerHTML = `
                <div class="log-meta">
                    [${time}] User: ${log.from_number} → Bot: ${log.to_number} | Status: ${log.status}
                </div>
                <div class="log-text"><strong>Usuario:</strong> ${payloadText}</div>
                ${log.ai_response ? `<div class="log-response"><strong>IA:</strong> ${log.ai_response}</div>` : ''}
            `;
            container.appendChild(entry);
        });
    }
}

// Credentials Management
async function loadCredentials() {
    console.log('Loading credentials...');
    try {
        const creds = await adminFetch('/admin/credentials');
        const container = document.getElementById('creds-list');

        if (!container) return;

        // Get filter values
        const tenantFilter = document.getElementById('cred-filter-tenant').value;
        const typeFilter = document.getElementById('cred-filter-type').value;

        container.innerHTML = '';

        if (creds && Array.isArray(creds) && creds.length > 0) {
            // Apply Filters
            const filteredCreds = creds.filter(c => {
                if (tenantFilter && String(c.tenant_id) !== tenantFilter) return false;
                if (typeFilter && c.category !== typeFilter) return false;
                return true;
            });

            if (filteredCreds.length === 0) {
                container.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay credenciales que coincidan con los filtros</td></tr>';
                return;
            }

            console.log(`Rendering ${filteredCreds.length} credentials`);
            filteredCreds.forEach(c => {
                const scopeDisplay = c.scope === 'global' ?
                    '<span class="badge global" style="background: rgba(147, 51, 234, 0.2); color: #c084fc; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Global</span>' :
                    '<span class="badge tenant" style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Tenant</span>';

                const tenantDisplay = c.scope === 'global' ?
                    '<span style="opacity: 0.5">-</span>' :
                    (c.tenant_name || `ID: ${c.tenant_id}`);

                const categoryDisplay = c.category ?
                    `<span class="badge type" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${c.category}</span>` : '-';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${c.name}</strong></td>
                    <td style="font-family: monospace; letter-spacing: 2px;">••••••••</td>
                    <td>${categoryDisplay}</td>
                    <td>${tenantDisplay}</td>
                    <td>${scopeDisplay}</td>
                    <td>
                         <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px; margin-right: 5px;" onclick="viewCredentialInfo(${c.id})">Info</button>
                        <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px; margin-right: 5px;" onclick="editCredential(${c.id})">Editar</button>
                        <button class="btn-delete" style="padding: 5px 12px; font-size: 12px" onclick="deleteCredential(${c.id})">Borrar</button>
                    </td>
                `;
                container.appendChild(tr);
            });
        } else {
            container.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay credenciales configuradas</td></tr>';
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
        const container = document.getElementById('creds-list');
        if (container) {
            container.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--error);">Error cargando credenciales: ${error.message}</td></tr>`;
        }
    }
}

async function loadCredentialFilters() {
    try {
        const tenants = await adminFetch('/admin/tenants');
        const select = document.getElementById('cred-filter-tenant');

        if (!select) return;

        // Keep first option "Todos los Tenants" and remove others
        while (select.options.length > 1) {
            select.remove(1);
        }

        if (tenants) {
            tenants.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.store_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error loading tenant filter:", error);
    }
}

function viewCredentialInfo(id) {
    adminFetch(`/admin/credentials/${id}`).then(c => {
        alert(`Detalles de Credencial:\n\nNombre: ${c.name}\nScope: ${c.scope}\nTenant: ${c.tenant_name || '-'}\nTipo: ${c.category || '-'}\nDescripción: ${c.description || 'Sin descripción'}`);
    });
}

// Tools Management
async function loadTools() {
    const tools = await adminFetch('/admin/tools');
    const container = document.getElementById('tools-list');
    container.innerHTML = '';

    if (tools) {
        tools.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${t.name}</td>
                <td>${t.type}</td>
                <td>${t.service_url || 'N/A'}</td>
                <td>
                    <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px" onclick="configureTool('${t.name}')">Configurar</button>
                    <button class="btn-delete" style="padding: 5px 12px; font-size: 12px" onclick="deleteTool('${t.name}')">Eliminar</button>
                </td>
            `;
            container.appendChild(tr);
        });
    }
}

function configureTool(name) {
    if (name === 'derivhumano') {
        const section = document.querySelector('.handoff-config-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
            // Highlight the section briefly
            section.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
            setTimeout(() => section.style.backgroundColor = '', 2000);
            return;
        }
    }
    // Current tools are hardcoded in backend, so we just show an info for now
    openModal('tool-modal');
    // Pre-fill name if editing
    const form = document.getElementById('tool-form');
    form.elements['name'].value = name;
}

async function deleteTool(name) {
    if (confirm(`¿Estás seguro de eliminar la herramienta ${name}?`)) {
        showNotification(true, 'Procesando', 'Las herramientas predefinidas no se pueden eliminar en esta versión.');
    }
}

// --- Human Handoff Configuration ---

function toggleHandoffUI() {
    const isEnabled = document.getElementById('handoff-enabled').checked;
    const container = document.getElementById('handoff-form-container');
    if (isEnabled) {
        container.style.opacity = '1';
        container.style.pointerEvents = 'all';
    } else {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
    }
}

async function updateHandoffTenantSelect() {
    const select = document.getElementById('handoff-tenant-select');
    const tenants = await adminFetch('/admin/tenants');
    if (!tenants) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Seleccionar Tenant...</option>';
    tenants.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.store_name} (${t.bot_phone_number})`;
        select.appendChild(opt);
    });
    if (currentValue) select.value = currentValue;
}

// Triggered when switching to 'tools' view
async function initHandoffConfig() {
    await updateHandoffTenantSelect();
    const select = document.getElementById('handoff-tenant-select');

    // Auto-select first tenant if available
    if (select.options.length > 1 && !select.value) {
        select.selectedIndex = 1;
        loadHandoffSettings();
    }
}

// Add event listener for tenant change
document.getElementById('handoff-tenant-select')?.addEventListener('change', loadHandoffSettings);

async function loadHandoffSettings() {
    const tenantId = document.getElementById('handoff-tenant-select').value;
    if (!tenantId) return;

    try {
        const config = await adminFetch(`/admin/handoff/${tenantId}`);

        if (config) {
            document.getElementById('handoff-enabled').checked = config.enabled;
            document.getElementById('handoff-target-email').value = config.destination_email || '';
            document.getElementById('handoff-instructions').value = config.handoff_instructions || '';
            document.getElementById('handoff-message').value = config.handoff_message || '';

            // Triggers
            const triggers = config.triggers || {};
            document.getElementById('rule-fitting').checked = triggers.rule_fitting || false;
            document.getElementById('rule-reclamo').checked = triggers.rule_reclamo || false;
            document.getElementById('rule-dolor').checked = triggers.rule_dolor || false;
            document.getElementById('rule-talle').checked = triggers.rule_talle || false;
            document.getElementById('rule-especial').checked = triggers.rule_especial || false;

            // Context
            const ctx = config.email_context || {};
            document.getElementById('ctx-name').checked = ctx.ctx_name !== false;
            document.getElementById('ctx-phone').checked = ctx.ctx_phone !== false;
            document.getElementById('ctx-history').checked = ctx.ctx_history || false;
            document.getElementById('ctx-id').checked = ctx.ctx_id || false;

            // SMTP
            document.getElementById('smtp-host').value = config.smtp_host || '';
            document.getElementById('smtp-port').value = config.smtp_port || '';
            document.getElementById('smtp-security').value = config.smtp_security || 'SSL';
            document.getElementById('smtp-user').value = config.smtp_username || '';
            document.getElementById('smtp-pass').value = config.smtp_password || '********';

            toggleHandoffUI();
        } else {
            // Reset for new tenant
            document.getElementById('handoff-enabled').checked = true;
            document.getElementById('handoff-target-email').value = '';
            document.getElementById('handoff-instructions').value = '';
            document.getElementById('handoff-message').value = '';
            document.getElementById('smtp-host').value = '';
            document.getElementById('smtp-port').value = '465';
            document.getElementById('smtp-security').value = 'SSL';
            document.getElementById('smtp-user').value = '';
            document.getElementById('smtp-pass').value = '';
            toggleHandoffUI();
        }
    } catch (e) {
        console.error("Error loading handoff config:", e);
    }
}

async function saveHandoffSettings() {
    const tenantId = document.getElementById('handoff-tenant-select').value;
    if (!tenantId) {
        showNotification(false, 'Validación', 'Por favor selecciona un tenant primero.');
        return;
    }

    const payload = {
        tenant_id: tenantId,
        enabled: document.getElementById('handoff-enabled').checked,
        destination_email: document.getElementById('handoff-target-email').value,
        handoff_instructions: document.getElementById('handoff-instructions').value,
        handoff_message: document.getElementById('handoff-message').value,
        smtp_host: document.getElementById('smtp-host').value,
        smtp_port: parseInt(document.getElementById('smtp-port').value),
        smtp_security: document.getElementById('smtp-security').value,
        smtp_username: document.getElementById('smtp-user').value,
        smtp_password: document.getElementById('smtp-pass').value,
        triggers: {
            rule_fitting: document.getElementById('rule-fitting').checked,
            rule_reclamo: document.getElementById('rule-reclamo').checked,
            rule_dolor: document.getElementById('rule-dolor').checked,
            rule_talle: document.getElementById('rule-talle').checked,
            rule_especial: document.getElementById('rule-especial').checked
        },
        email_context: {
            ctx_name: document.getElementById('ctx-name').checked,
            ctx_phone: document.getElementById('ctx-phone').checked,
            ctx_history: document.getElementById('ctx-history').checked,
            ctx_id: document.getElementById('ctx-id').checked
        }
    };

    try {
        const res = await adminFetch('/admin/handoff', 'POST', payload);

        if (res) {
            showNotification(true, 'Éxito', 'Configuración de derivación guardada correctamente.');
            // Reload to mask password
            await loadHandoffSettings();
        }
    } catch (e) {
        showNotification(false, 'Error', 'No se pudo guardar la configuración.');
    }
}

async function saveCredential(name, value, category, scope, tenantId) {
    return await adminFetch('/admin/credentials', 'POST', {
        name, value, category, scope, tenant_id: tenantId
    });
}

// Analytics Management
async function loadAnalytics() {
    const tenantFilter = document.getElementById('analytics-tenant-filter').value;
    const timeFilter = document.getElementById('analytics-time-filter').value;

    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeFilter || '7'));
    const startDateStr = startDate.toISOString().split('T')[0];

    try {
        // Load analytics summary
        const summary = await adminFetch(`/admin/analytics/summary?tenant_id=${tenantFilter || 1}&from_date=${startDateStr}&to_date=${endDate}`);
        displayAnalyticsSummary(summary);

        // Load recent events
        const events = await adminFetch(`/admin/telemetry/events?tenant_id=${tenantFilter || 1}&from_date=${startDateStr}&to_date=${endDate}&page_size=20`);
        displayAnalyticsEvents(events);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification(false, 'Error', 'No se pudieron cargar las métricas');
    }
}

function displayAnalyticsSummary(summary) {
    if (!summary || !summary.kpis) {
        // Show empty state
        document.getElementById('kpi-conversations').textContent = '0';
        document.getElementById('kpi-messages').textContent = '0';
        document.getElementById('kpi-success-rate').textContent = '0%';
        document.getElementById('kpi-avg-response').textContent = '0ms';
        return;
    }

    const kpis = summary.kpis;

    // Update KPIs
    document.getElementById('kpi-conversations').textContent = kpis.conversations?.value || 0;
    document.getElementById('kpi-messages').textContent = kpis.orders_lookup?.requested || 0;
    document.getElementById('kpi-success-rate').textContent = `${Math.round((kpis.orders_lookup?.success_rate || 0) * 100)}%`;

    // Calculate average response time (placeholder - would need actual timing data)
    document.getElementById('kpi-avg-response').textContent = '150ms'; // Placeholder
}

function displayAnalyticsEvents(events) {
    const container = document.getElementById('analytics-events');

    if (!events || !events.items || events.items.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="4" class="empty-row">
                    <div class="table-empty">
                        <div class="empty-icon">📋</div>
                        <p>No hay eventos recientes</p>
                        <small>Los eventos del sistema aparecerán aquí</small>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    container.innerHTML = '';
    events.items.slice(0, 10).forEach(event => {
        const tr = document.createElement('tr');
        const timestamp = new Date(event.occurred_at).toLocaleString();
        const severityClass = `severity-${event.severity || 'info'}`;

        tr.innerHTML = `
            <td>${timestamp}</td>
            <td>${event.event_type}</td>
            <td><span class="severity-badge ${severityClass}">${event.severity || 'info'}</span></td>
            <td>${event.error_message || event.payload?.message || 'N/A'}</td>
        `;
        container.appendChild(tr);
    });
}

async function loadAnalyticsTenants() {
    try {
        const tenants = await adminFetch('/admin/tenants');
        const select = document.getElementById('analytics-tenant-filter');

        // Clear existing options except "All"
        while (select.options.length > 1) {
            select.remove(1);
        }

        if (tenants) {
            tenants.forEach(tenant => {
                const option = document.createElement('option');
                option.value = tenant.id;
                option.textContent = tenant.store_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading analytics tenants:', error);
    }
}

function updateToolConfig() {
    const type = document.querySelector('[name="type"]').value;
    const configDiv = document.getElementById('tool-config');
    configDiv.innerHTML = '';

    if (type === 'http') {
        configDiv.innerHTML = `
            <div class="form-group full">
                <label>Configuración HTTP (JSON)</label>
                <textarea name="config" rows="3" placeholder='{"default_method": "GET"}'></textarea>
            </div>
        `;
    } else if (type === 'tienda_nube') {
        configDiv.innerHTML = `
            <div class="form-group">
                <label>Store ID</label>
                <input type="text" name="store_id" placeholder="12345">
            </div>
            <div class="form-group">
                <label>Access Token</label>
                <input type="password" name="access_token">
            </div>
        `;
    }
}

// Tenant Edit/Delete
let editingTenant = null;

function resetTenantModal() {
    editingTenant = null;
    document.getElementById('tenant-modal-title').textContent = 'Configuración de Tienda';
    document.getElementById('delete-tenant-btn').style.display = 'none';
    document.getElementById('tenant-form').reset();
    document.getElementById('tenant-credentials-list').innerHTML = '';
}

function editTenant(botPhoneNumber) {
    console.log('Edit tenant called with:', botPhoneNumber); // Debug log

    // Fetch tenant data
    adminFetch(`/admin/tenants/${botPhoneNumber}`).then(tenant => {
        console.log('Tenant data received:', tenant); // Debug log

        if (tenant) {
            // Pre-fill form
            const form = document.getElementById('tenant-form');
            if (form) {
                form.dataset.tenantId = tenant.id;
                form.elements['store_name'].value = tenant.store_name || '';
                form.elements['bot_phone_number'].value = tenant.bot_phone_number || '';
                form.elements['tiendanube_store_id'].value = tenant.tiendanube_store_id || '';
                form.elements['tiendanube_access_token'].value = tenant.tiendanube_access_token || '';
                form.elements['store_description'].value = tenant.store_description || '';
                form.elements['store_catalog_knowledge'].value = tenant.store_catalog_knowledge || '';
                form.elements['store_location'].value = tenant.store_location || '';
                form.elements['store_website'].value = tenant.store_website || '';
                form.elements['owner_email'].value = tenant.owner_email || '';

                editingTenant = botPhoneNumber;
                const title = document.getElementById('tenant-modal-title');
                if (title) title.textContent = 'Editar Tienda';

                const deleteBtn = document.getElementById('delete-tenant-btn');
                if (deleteBtn) deleteBtn.style.display = 'inline-block';

                openModal('tenant-modal');
                // Render associated credentials
                if (tenant.id) {
                    renderTenantCredentials(tenant.id);
                }
                console.log('Modal opened successfully'); // Debug log
            } else {
                console.error('Tenant form not found');
                showNotification(false, 'Error', 'No se pudo encontrar el formulario de edición');
            }
        } else {
            console.error('No tenant data received');
            showNotification(false, 'Error', 'No se pudieron cargar los datos de la tienda');
        }
    }).catch(error => {
        console.error('Error fetching tenant:', error);
        showNotification(false, 'Error', 'Error al cargar los datos de la tienda');
    });
}

async function deleteTenant(phoneNumber) {
    const idToDelete = phoneNumber || editingTenant;
    if (!idToDelete) return;

    if (!confirm(`¿Estás seguro de que quieres eliminar esta tienda? Esta acción no se puede deshacer.`)) return;

    try {
        const res = await adminFetch(`/admin/tenants/${encodeURIComponent(idToDelete)}`, 'DELETE');
        if (res && res.status === 'ok') {
            showNotification(true, 'Tienda Eliminada', 'La tienda se eliminó correctamente.');
            closeModal('tenant-modal');
            loadTenants();
            if (typeof updateStats === 'function') updateStats();

            // Call step reset if it exists
            if (typeof checkAndResetStep3 === 'function') checkAndResetStep3();
        } else {
            showNotification(false, 'Error', 'No se pudo eliminar la tienda.');
        }
    } catch (error) {
        showNotification(false, 'Error de Conexión', `Error: ${error.message}`);
    }
}

// Render credentials in Tenant Modal
async function renderTenantCredentials(tenantId) {
    const listContainer = document.getElementById('tenant-credentials-list');
    listContainer.innerHTML = '<div style="text-align: center; color: #aaa; padding: 10px;">Cargando credenciales...</div>';

    try {
        const creds = await adminFetch('/admin/credentials');
        listContainer.innerHTML = '';

        if (!creds || creds.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 10px;">No hay credenciales disponibles.</div>';
            return;
        }

        // Filter for this tenant
        const tenantSpecific = creds.filter(c => c.scope === 'tenant' && c.tenant_id == tenantId);
        const globalCreds = creds.filter(c => c.scope === 'global');

        // Helper to render a group
        const renderGroup = (title, items, isGlobal) => {
            if (items.length === 0) return '';

            let html = `<h4 style="color: #888; margin: 15px 0 10px; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">${title}</h4>`;
            items.forEach(c => {
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px; margin-bottom: 5px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 500; color: #e4e4e7;">${c.name}</span>
                            <span style="font-size: 0.8em; color: #a1a1aa; margin-top: 2px;">${c.category || 'Sin categoría'}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-family: monospace; letter-spacing: 2px; color: #71717a;">••••••••</span>
                            ${isGlobal ?
                        '<span class="badge global" style="font-size: 0.7em; opacity: 0.7;">Global</span>' :
                        `<button class="btn-delete" style="padding: 2px 8px; font-size: 10px;" onclick="deleteCredential(${c.id})">Borrar</button>`
                    }
                        </div>
                    </div>
                `;
            });
            return html;
        };

        let content = '';
        content += renderGroup('Tenant-Specific', tenantSpecific, false);
        content += renderGroup('Global (Heredadas)', globalCreds, true);

        if (content === '') {
            content = '<div style="text-align: center; color: #666; padding: 10px;">No hay credenciales asociadas.</div>';
        }

        listContainer.innerHTML = content;

    } catch (error) {
        console.error('Error rendering tenant credentials:', error);
        listContainer.innerHTML = `<div style="color: var(--error); padding: 10px;">Error al cargar credenciales: ${error.message}</div>`;
    }
}

// Form Submission
document.getElementById('tenant-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const res = await adminFetch('/admin/tenants', 'POST', data);
        if (res && res.status === 'ok') {
            const message = editingTenant ? 'La tienda se actualizó correctamente.' : 'La tienda se creó correctamente.';
            showNotification(true, editingTenant ? 'Tienda Actualizada' : 'Tienda Creada', message);
            closeModal('tenant-modal');
            resetTenantModal();
            loadTenants();
            updateStats();
        } else {
            showNotification(false, 'Error', 'No se pudo guardar la tienda. Verifica los datos e intenta de nuevo.');
        }
    } catch (error) {
        showNotification(false, 'Error de Conexión', `Error: ${error.message}. Verifica la URL del API.`);
    } finally {
        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Credentials Management Variables
let editingCredential = null;

// Reset Credentials Modal
function resetCredentialModal() {
    editingCredential = null;
    document.getElementById('cred-modal').querySelector('h2').textContent = 'Agregar/Editar Credencial';
    document.getElementById('cred-form').reset();
    document.getElementById('tenant-selector').style.display = 'none';
    // Always load tenant selector
    loadTenantSelector();
}

// Edit Credential
async function editCredential(id) {
    try {
        // Fetch the credential data
        const credential = await adminFetch(`/admin/credentials/${id}`);
        if (!credential) {
            showNotification(false, 'Error', 'Credencial no encontrada');
            return;
        }

        editingCredential = id;
        document.getElementById('cred-modal').querySelector('h2').textContent = `Editar Credencial`;

        // Populate form with existing data
        const form = document.getElementById('cred-form');
        form.elements['name'].value = credential.name || '';
        form.elements['value'].value = credential.value || ''; // Note: This exposes the actual value
        form.elements['category'].value = credential.category || '';
        form.elements['description'].value = credential.description || '';
        form.elements['scope'].value = credential.scope || 'global';

        // Handle tenant selector
        toggleTenantSelector();

        if (credential.scope === 'tenant') {
            form.elements['tenant_id'].value = credential.tenant_id || '';
        }

        openModal('cred-modal');
    } catch (error) {
        showNotification(false, 'Error', 'No se pudo cargar la credencial para editar');
        console.error('Error loading credential:', error);
    }
}

// Delete Credential
async function deleteCredential(id) {
    if (confirm(`¿Estás seguro de que quieres eliminar esta credencial? Esta acción no se puede deshacer.`)) {
        try {
            const res = await adminFetch(`/admin/credentials/${id}`, 'DELETE');
            if (res && res.status === 'ok') {
                showNotification(true, 'Credencial Eliminada', 'La credencial se eliminó correctamente.');

                // Reload main list
                loadCredentials();

                // Reload tenant modal list if open
                const tenantModal = document.getElementById('tenant-modal');
                const tenantForm = document.getElementById('tenant-form');
                if (tenantModal && tenantModal.style.display === 'flex' && tenantForm && tenantForm.dataset.tenantId) {
                    renderTenantCredentials(tenantForm.dataset.tenantId);
                }
            } else {
                showNotification(false, 'Error', 'No se pudo eliminar la credencial.');
            }
        } catch (error) {
            showNotification(false, 'Error de Conexión', `Error: ${error.message}`);
        }
    }
}

// Toggle Tenant Selector
function toggleTenantSelector() {
    const scope = document.getElementById('cred-form').elements['scope'].value;
    const tenantSelector = document.getElementById('tenant-selector');

    if (scope === 'tenant') {
        tenantSelector.style.display = 'block';
        loadTenantSelector();
    } else {
        tenantSelector.style.display = 'none';
        document.getElementById('cred-tenant-select').value = '';
    }
}

// Load Tenant Selector
async function loadTenantSelector(selectId = 'cred-tenant-select') {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">Seleccionar tenant...</option>';

    try {
        const tenants = await adminFetch('/admin/tenants');
        if (tenants) {
            tenants.forEach(tenant => {
                const option = document.createElement('option');
                option.value = tenant.id;
                option.textContent = tenant.store_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading tenants:', error);
    }
}

// Credentials Form
document.getElementById('cred-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Validate tenant selection for tenant-scoped credentials
    if (data.scope === 'tenant' && !data.tenant_id) {
        showNotification(false, 'Error', 'Debes seleccionar un tenant para credenciales con scope "tenant".');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
    }

    // Handle tenant_id conversion
    if (data.scope === 'global') {
        // For global scope, remove tenant_id or set to null
        data.tenant_id = null;
    } else if (data.tenant_id) {
        // For tenant scope, convert to int
        try {
            data.tenant_id = parseInt(data.tenant_id);
            if (isNaN(data.tenant_id)) {
                throw new Error('Invalid tenant_id');
            }
        } catch (error) {
            showNotification(false, 'Error', 'El tenant_id debe ser un número válido.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }
    }

    try {
        console.log('Submitting credential data:', data); // Debug log

        let res;
        if (editingCredential) {
            // Update existing credential
            res = await adminFetch(`/admin/credentials/${editingCredential}`, 'PUT', data);
        } else {
            // Create new credential
            res = await adminFetch('/admin/credentials', 'POST', data);
        }

        console.log('Credential save response:', res); // Debug log

        if (res && res.status === 'ok') {
            const message = editingCredential ?
                'La credencial se actualizó correctamente.' :
                'La credencial se almacenó correctamente.';
            showNotification(true, editingCredential ? 'Credencial Actualizada' : 'Credencial Guardada', message);
            closeModal('cred-modal');
            resetCredentialModal();
            loadCredentials();
        } else {
            const errorMsg = res?.detail || res?.message || 'Respuesta inesperada del servidor';
            showNotification(false, 'Error al Guardar', `No se pudo guardar la credencial: ${errorMsg}`);
        }
    } catch (error) {
        console.error('Credential save error:', error);
        let errorMsg = error.message || 'Error desconocido';

        // Try to extract more detailed error from response
        if (error.responseText) {
            try {
                const errorData = JSON.parse(error.responseText);
                errorMsg = errorData.error || errorData.detail || errorMsg;
            } catch (parseError) {
                // If not JSON, use the raw text
                if (error.responseText) {
                    errorMsg = error.responseText;
                }
            }
        }

        showNotification(false, 'Error al Guardar', `Error: ${errorMsg}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// YCloud Form
document.getElementById('ycloud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        // Save both keys to credentials table
        const tenant_id = data.tenant_id ? parseInt(data.tenant_id) : null;
        const scope = tenant_id ? 'tenant' : 'global';

        await adminFetch('/admin/credentials', 'POST', {
            name: "YCLOUD_API_KEY",
            value: data.api_key || data.YCLOUD_API_KEY,
            category: "whatsapp_ycloud",
            scope: scope,
            tenant_id: tenant_id,
            description: "YCloud API Key for WhatsApp"
        });

        await adminFetch('/admin/credentials', 'POST', {
            name: "YCLOUD_WEBHOOK_SECRET",
            value: data.webhook_secret || data.YCLOUD_WEBHOOK_SECRET,
            category: "whatsapp_ycloud",
            scope: scope,
            tenant_id: tenant_id,
            description: "YCloud Webhook Secret"
        });

        showNotification(true, 'YCloud Configurado', 'La configuración de WhatsApp (YCloud) se guardó correctamente.');
        closeModal('ycloud-config-modal');
        if (typeof loadCredentials === 'function') loadCredentials();
    } catch (error) {
        showNotification(false, 'Error de Conexión', `Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Tool Form
document.getElementById('tool-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Build config object
    let config = {};
    if (data.type === 'http') {
        config = data.config ? JSON.parse(data.config) : {};
    } else if (data.type === 'tienda_nube') {
        config = {
            store_id: data.store_id,
            access_token: data.access_token
        };
    }

    const toolData = {
        name: data.name,
        type: data.type,
        config: config,
        service_url: data.service_url || null
    };

    try {
        const res = await adminFetch('/admin/tools', 'POST', toolData);
        if (res && res.status === 'ok') {
            showNotification(true, 'Herramienta Creada', 'La herramienta se creó correctamente.');
            closeModal('tool-modal');
            loadTools();
        } else {
            showNotification(false, 'Error', 'No se pudo crear la herramienta.');
        }
    } catch (error) {
        showNotification(false, 'Error de Conexión', `Error: ${error.message}`);
    }
});

// Tour System
const tourSteps = [
    {
        icon: "📊",
        title: "Panel General",
        content: "Aquí verás métricas clave: tiendas activas, mensajes totales y éxito de la IA. Monitorea el rendimiento de tus bots en tiempo real."
    },
    {
        icon: "🏘️",
        title: "Mis Tiendas",
        content: "Gestiona tus tiendas conectadas a Tienda Nube. Crea nuevas tiendas configurando nombre, número de WhatsApp, ID de Tienda Nube y tokens. Cada tienda puede tener su propio branding y catálogo."
    },
    {
        icon: "🔐",
        title: "Credenciales",
        content: "Almacena de forma segura tus API keys y tokens. Incluye credenciales globales como OpenAI, YCloud, y tokens específicos por tienda para Tienda Nube."
    },
    {
        icon: "📱",
        title: "WhatsApp (YCloud)",
        content: "Conecta tu cuenta de WhatsApp Business. Para configurar:<br><br>1. Crea una cuenta en <a href='https://developers.facebook.com' target='_blank'>Meta for Developers</a><br>2. Configura un Portfolio y agrega WhatsApp<br>3. Crea una app de WhatsApp Business<br>4. Obtén API Key y Webhook Secret<br>5. Configura webhooks apuntando a tu dominio:8002<br>6. Escanea el QR en Meta para verificar el número<br><br>Nota: Asegura coexistencia con WhatsApp personal activando 'Coexistencia' en la app."
    },
    {
        icon: "📜",
        title: "Live History",
        content: "Visualiza mensajes en tiempo real. Ve conversaciones entre usuarios y la IA, con respuestas generadas. Útil para debugging y monitoreo."
    },
    {
        icon: "📈",
        title: "Métricas Avanzadas",
        content: "Análisis detallado de rendimiento: tasas de respuesta, tiempos de procesamiento, errores y patrones de uso. Próximamente disponible."
    }
];

let currentTourStep = 0;

function startTour() {
    if (localStorage.getItem('codexy_tour_completed')) return;
    currentTourStep = 0;
    showTourStep();
    document.getElementById('tour-overlay').style.display = 'flex';
}

function showTourStep() {
    const step = tourSteps[currentTourStep];
    document.getElementById('tour-icon').textContent = step.icon;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-content').innerHTML = step.content;

    const nextBtn = document.getElementById('tour-next');
    nextBtn.textContent = currentTourStep === tourSteps.length - 1 ? 'Finalizar' : 'Siguiente';
}

function nextTourStep() {
    currentTourStep++;
    if (currentTourStep >= tourSteps.length) {
        endTour();
    } else {
        showTourStep();
    }
}

function endTour() {
    document.getElementById('tour-overlay').style.display = 'none';
    localStorage.setItem('codexy_tour_completed', 'true');
}

document.getElementById('tour-next').addEventListener('click', nextTourStep);
document.getElementById('tour-skip').addEventListener('click', endTour);

// Connection and Diagnostics
function connectInstance() {
    const apiStatus = document.getElementById('api-status');
    apiStatus.textContent = 'Conectando...';
    apiStatus.className = 'card-status';

    // Test connection
    checkConnection().then(success => {
        if (success) {
            apiStatus.textContent = 'Conectado ✓';
            apiStatus.classList.add('ok');
            updateWelcomeFromBootstrap();
        } else {
            apiStatus.textContent = 'Error de conexión';
            apiStatus.classList.add('error');
        }
    });
}

function checkConnection() {
    return adminFetch('/health').then(() => {
        return adminFetch('/admin/bootstrap');
    }).then(bootstrap => {
        // Connection status is now verified on each page load
        // No localStorage caching to prevent stale data
        updateWelcomeFromBootstrap(bootstrap);
        return true;
    }).catch(error => {
        console.error('Connection error:', error);
        return false;
    });
}

function updateWelcomeFromBootstrap(bootstrap) {
    if (!bootstrap) return;

    // Update webhook URL
    const webhookUrl = bootstrap.suggested_webhook_url || 'No disponible';
    document.getElementById('webhook-url-display').textContent = webhookUrl;

    // Update checklist
    updateChecklist(bootstrap);
}

function updateChecklist(bootstrap) {
    const tenantCheck = document.getElementById('check-tenant');
    const tnCheck = document.getElementById('check-tiendanube');
    const openaiCheck = document.getElementById('check-openai');

    // Tenant check
    if (bootstrap.tenants_count > 0) {
        tenantCheck.querySelector('.check-status').textContent = '✅';
        tenantCheck.style.color = 'var(--success)';
    }

    // Tienda Nube check
    if (bootstrap.configured_services && bootstrap.configured_services.includes('tiendanube')) {
        tnCheck.querySelector('.check-status').textContent = '✅';
        tnCheck.style.color = 'var(--success)';
    }

    // OpenAI check
    if (bootstrap.configured_services && bootstrap.configured_services.includes('openai')) {
        openaiCheck.querySelector('.check-status').textContent = '✅';
        openaiCheck.style.color = 'var(--success)';
    }

    // WhatsApp YCloud check
    const ycloudCheck = document.getElementById('check-ycloud');
    if (ycloudCheck && bootstrap.configured_services && bootstrap.configured_services.includes('whatsapp_ycloud')) {
        ycloudCheck.querySelector('.check-status').textContent = '✅';
        ycloudCheck.style.color = 'var(--success)';
    }

    // WhatsApp Meta check
    const metaCheck = document.getElementById('check-meta');
    if (metaCheck && bootstrap.configured_services && bootstrap.configured_services.includes('whatsapp_meta')) {
        metaCheck.querySelector('.check-status').textContent = '✅';
        metaCheck.style.color = 'var(--success)';
    }
}

function copyWebhookUrl() {
    const webhookUrl = document.getElementById('webhook-url-display').textContent;
    navigator.clipboard.writeText(webhookUrl).then(() => {
        showNotification(true, 'Copiado', 'URL del webhook copiada al portapapeles');
    });
}

async function testWhatsAppMetaConnection() {
    const resultDiv = document.getElementById('meta-test-result');
    resultDiv.innerHTML = '<div style="color: var(--text-secondary)">Probando conexión con WhatsApp Meta API...</div>';

    try {
        // Check if credentials exist
        const status = await adminFetch('/admin/whatsapp-meta/status', 'GET', null, 'default');
        if (status && status.connected) {
            resultDiv.innerHTML = '<div style="color: var(--success)">✅ Conexión exitosa - Credenciales válidas</div>';
            showNotification(true, 'Conexión Exitosa', 'WhatsApp Meta API está correctamente configurado.');
        } else {
            resultDiv.innerHTML = '<div style="color: var(--accent)">❌ Credenciales no encontradas - Configura primero las credenciales arriba</div>';
            showNotification(false, 'Credenciales Faltantes', 'Guarda las credenciales de WhatsApp Meta API primero.');
        }
    } catch (error) {
        resultDiv.innerHTML = `<div style="color: var(--accent)">❌ Error de conexión: ${error.message}</div>`;
        showNotification(false, 'Error de Conexión', 'No se pudo verificar la conexión con WhatsApp Meta API.');
    }
}

async function testTenantConnection(phone, storeId, token) {
    showNotification(false, 'Probando...', `Verificando conexión para ${phone}...`);
    try {
        const res = await adminFetch(`/admin/tenants/${phone}/test-message`, 'POST');
        if (res && res.status === 'ok') {
            showNotification(true, 'Test Exitoso', 'El mensaje de prueba se encoló correctamente.');
        } else {
            showNotification(false, 'Error en Test', 'El servidor retornó un error al intentar enviar el mensaje.');
        }
    } catch (error) {
        showNotification(false, 'Error de Conexión', error.message);
    }
}

function verifyWebhook() {
    showNotification(false, 'Verificando...', 'Envía un mensaje de prueba a tu número de WhatsApp');

    // Poll for new inbound events
    const initialInbound = document.getElementById('last-inbound').textContent;

    setTimeout(() => {
        updateStats(); // Refresh last signals
        setTimeout(() => {
            const newInbound = document.getElementById('last-inbound').textContent;
            if (newInbound !== initialInbound && newInbound !== 'Nunca') {
                showNotification(true, 'Webhook Verificado', '¡Evento recibido exitosamente!');
            } else {
                showNotification(false, 'Sin Eventos', 'No se detectaron nuevos eventos. Verifica la configuración del webhook.');
            }
        }, 2000);
    }, 3000);
}

function showStatus(message, isError) {
    const statusEl = document.getElementById('connect-status');
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
}

function runDiagnostics() {
    openModal('diagnostics-modal');
    document.getElementById('diagnostics-content').innerHTML = '<p>Verificando servicios...</p>';
    adminFetch('/health').then(() => {
        document.getElementById('diagnostics-content').innerHTML = '<p style="color: var(--success)">✓ Orquestador operativo</p><p style="color: var(--text-secondary)">Otros servicios requieren verificación manual</p>';
    }).catch(() => {
        document.getElementById('diagnostics-content').innerHTML = '<p style="color: var(--accent)">✗ Problemas de conexión con el orquestador</p>';
    });
}

// Initial Load - Always verify connection fresh
checkConnection().then(success => {
    if (success) {
        showView('overview');
        updateStats();
        loadAnalyticsTenants(); // Load tenants for analytics filter
        setInterval(updateStats, 10000);
        setInterval(() => {
            if (currentView === 'logs') loadLogs();
        }, 5000);
        startTour();
    } else {
        // Stay on welcome with error state
        document.getElementById('api-status').textContent = 'Error de conexión';
        document.getElementById('api-status').classList.add('error');
    }
});

// Event listeners
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('config-btn')) {
        const phone = e.target.getAttribute('data-phone');
        editTenant(phone);
    }
});

// Setup Wizard
let currentSetupStep = 1;
const totalSetupSteps = 5; // Simplified to essential steps

function startSetupWizard() {
    currentSetupStep = 1;
    showView('setup');
    renderSetupStep();
}

function renderSetupStep() {
    const content = document.getElementById('setup-content');
    const progress = ((currentSetupStep - 1) / (totalSetupSteps - 1)) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';

    // Update step indicators
    for (let i = 1; i <= totalSetupSteps; i++) {
        const stepEl = document.getElementById('step-' + i);
        stepEl.classList.remove('active', 'completed');
        if (i < currentSetupStep) {
            stepEl.classList.add('completed');
        } else if (i === currentSetupStep) {
            stepEl.classList.add('active');
        }
    }

    // Update buttons
    document.getElementById('prev-btn').style.display = currentSetupStep > 1 ? 'inline-block' : 'none';
    document.getElementById('test-btn').style.display = [2, 3].includes(currentSetupStep) ? 'inline-block' : 'none';
    document.getElementById('next-btn').textContent = currentSetupStep === totalSetupSteps ? 'Finalizar' : 'Siguiente';

    // Render step content
    switch (currentSetupStep) {
        case 1:
            renderStep1();
            break;
        case 2:
            renderStep2();
            break;
        case 3:
            renderStep3();
            break;
        case 4:
            renderStep4();
            break;
        case 5:
            renderStep5();
            break;
        default:
            content.innerHTML = '<h2>Paso ' + currentSetupStep + '</h2><p>Próximamente...</p>';
    }
}

function renderStep1() {
    const content = document.getElementById('setup-content');
    content.innerHTML = `
        <h2 class="setup-step-title">Crear Tienda</h2>
        <p class="setup-step-description">Configura tu primera tienda para comenzar. Necesitarás un número de WhatsApp único.</p>
        <div class="setup-form">
            <div class="form-group">
                <label>Número de WhatsApp del Bot</label>
                <input type="text" id="setup-bot-phone" placeholder="5491234567890" required>
            </div>
            <div class="form-group">
                <label>Nombre de la Tienda</label>
                <input type="text" id="setup-store-name" placeholder="Mi Tienda Online" required>
            </div>
            <div class="form-group">
                <label>Sitio Web</label>
                <input type="url" id="setup-store-website" placeholder="https://mitienda.com">
            </div>
        </div>
    `;
}

function renderStep2() {
    const content = document.getElementById('setup-content');
    content.innerHTML = `
        <h2 class="setup-step-title">Conectar Tienda Nube</h2>
        <p class="setup-step-description">Integra con tu tienda Tienda Nube para acceder a productos y pedidos.</p>
        <div class="setup-form">
            <div class="form-group">
                <label>ID de Tienda Nube</label>
                <input type="text" id="setup-tn-store-id" placeholder="123456" required>
            </div>
            <div class="form-group">
                <label>Token de Acceso</label>
                <input type="password" id="setup-tn-token" required>
            </div>
        </div>
        <div id="tn-test-result"></div>
    `;
}

function renderStep4() {
    const content = document.getElementById('setup-content');
    content.innerHTML = `
        <h2 class="setup-step-title">Verificar Conexión</h2>
        <p class="setup-step-description">Comprobamos que todos los servicios estén conectados y funcionando.</p>
        <div class="setup-form">
            <button class="btn-primary" id="test-connection-btn">Verificar Conexión</button>
        </div>
        <div id="connection-test-result"></div>
    `;

    // Add event listener
    const testBtn = document.getElementById('test-connection-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => runStepTest(4));
    }
}

function renderStep5() {
    const content = document.getElementById('setup-content');
    content.innerHTML = `
        <h2 class="setup-step-title">Enviar Mensaje de Prueba</h2>
        <p class="setup-step-description">Envía un mensaje de prueba a tu número de WhatsApp para verificar que todo funciona.</p>
        <div class="setup-form">
            <button class="btn-primary" id="send-test-btn">Enviar Mensaje de Prueba</button>
        </div>
        <div id="test-message-result"></div>
    `;

    // Add event listener
    const testBtn = document.getElementById('send-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => runStepTest(5));
    }
}

async function renderStep3() {
    const content = document.getElementById('setup-content');

    // Check if any tenants exist
    let tenants = [];
    try {
        const response = await adminFetch('/admin/tenants');
        tenants = response || [];
    } catch (e) {
        console.error('Error fetching tenants:', e);
    }

    // If no tenants, prompt to create one
    if (!tenants || tenants.length === 0) {
        content.innerHTML = `
            <h2 class="setup-step-title">Crear Primera Tienda</h2>
            <p class="setup-step-description">No tienes tiendas configuradas. Crea tu primera tienda para continuar con el setup.</p>
            <div class="setup-form">
                <button class="btn-primary" onclick="showView('stores'); closeModal('setup-modal')">Ir a Mis Tiendas</button>
            </div>
            <div style="margin-top: 20px; padding: 15px; background: rgba(255,165,0,0.1); border: 1px solid orange; color: #ff8c00; border-radius: 8px;">
                <strong>💡 Tip:</strong> Ve a "Mis Tiendas" en el menú lateral para crear tu primera tienda con WhatsApp y Tienda Nube.
            </div>
        `;
        return;
    }

    // If tenants exist, show success
    content.innerHTML = `
        <h2 class="setup-step-title">Tienda Configurada</h2>
        <p class="setup-step-description">¡Excelente! Ya tienes ${tenants.length} tienda(s) configurada(s). El setup puede continuar.</p>
        <div class="setup-form">
            <button class="btn-primary" id="test-tenant-btn">Verificar Tienda</button>
        </div>
        <div id="tenant-test-result"></div>
    `;

    // Add event listener
    const testBtn = document.getElementById('test-tenant-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => runStepTest(3));
    }
}

function updateTestButton() {
    const select = document.getElementById('setup-tn-store-select');
    const selectedOption = select.options[select.selectedIndex];
    const storeId = selectedOption.value;
    const token = selectedOption.getAttribute('data-token');

    // Update test button text
    const testBtn = document.getElementById('test-btn');
    if (testBtn) {
        testBtn.textContent = storeId === 'global' ? 'Probar Tienda Global' : `Probar ${selectedOption.text}`;
    }
}

function nextStep() {
    // Mark current step as completed
    stepStatuses[currentSetupStep] = 'ok';
    updateStepUI();
    saveSetupProgress();

    if (currentSetupStep < totalSetupSteps) {
        currentSetupStep++;
        renderSetupStep();
    } else {
        // Complete setup
        showNotification(true, 'Configuración Completa', 'Tu bot está listo para usar. Ve al Overview para monitorear.');
        showView('overview');
    }
}

function prevStep() {
    if (currentSetupStep > 1) {
        currentSetupStep--;
        renderSetupStep();
    }
}

async function testCurrentStep() {
    if (currentSetupStep === 1) {
        await runStepTest(1);
    } else if (currentSetupStep === 2) {
        await runStepTest(2);
    } else if (currentSetupStep === 3) {
        await runStepTest(3);
    } else if (currentSetupStep === 4) {
        await runStepTest(4);
    } else if (currentSetupStep === 5) {
        await runStepTest(5);
    }
}

async function testTiendaNube() {
    // First check if there are any stores to test
    const stores = await adminFetch('/admin/setup/tiendanube/stores');
    if (!stores || stores.stores.length === 0) {
        // No stores available, prompt to create one
        if (confirm('No tienes tiendas Tienda Nube configuradas. ¿Quieres crear una ahora?')) {
            openModal('tenant-modal');
            resetTenantModal();
        }
        return;
    }

    const select = document.getElementById('setup-tn-store-select');
    if (!select) {
        showTestResult('tn-test-result', 'Selector no encontrado', true);
        return;
    }

    const selectedValue = select.value;
    if (!selectedValue || selectedValue === 'create-new') {
        showTestResult('tn-test-result', 'Selecciona una tienda para probar', true);
        return;
    }

    showTestResult('tn-test-result', 'Probando conexión...', false);

    try {
        const response = await adminFetch(`/admin/setup/tiendanube/stores/${selectedValue}/test`, 'POST');

        if (response && response.status === 'OK') {
            showTestResult('tn-test-result', `✓ Conexión exitosa - ${response.store_name}`, false);
            // Mark as active and update step
            await adminFetch(`/admin/setup/tiendanube/stores/${selectedValue}/activate`, 'POST');
            // Update UI status
            const option = select.querySelector(`option[value="${selectedValue}"]`);
            if (option) {
                option.textContent = option.textContent.replace('(inactive)', '(active)');
            }
            // Mark step as passed
            stepStatuses[3] = 'ok';
            updateStepUI();
            saveSetupProgress();
        } else {
            showTestResult('tn-test-result', `✗ Error: ${response?.error || 'Conexión fallida'}`, true);
        }
    } catch (error) {
        showTestResult('tn-test-result', `✗ Error de conexión: ${error.message}`, true);
    }
}

async function testYCloud() {
    const apiKey = document.getElementById('setup-ycloud-key').value;
    const secret = document.getElementById('setup-ycloud-secret').value;

    if (!apiKey || !secret) {
        showTestResult('ycloud-test-result', 'Completa todos los campos', true);
        return;
    }

    showTestResult('ycloud-test-result', 'Esperando webhook... Envía un mensaje de prueba a tu número', false);

    // This would poll for webhook events
    // For now, just show instruction
}

function showTestResult(elementId, message, isError) {
    const el = document.getElementById(elementId);
    el.innerHTML = `<div class="test-result ${isError ? 'error' : ''}">${message}</div>`;
}

function showTestResultWithCTA(elementId, message, subtitle, actions, isError) {
    const el = document.getElementById(elementId);
    let html = `<div class="test-result ${isError ? 'error' : ''}">`;
    html += `<div class="test-message">${message}</div>`;
    if (subtitle) {
        html += `<div class="test-subtitle">${subtitle}</div>`;
    }
    html += '<div class="test-actions">';

    actions.forEach(action => {
        if (action.url) {
            html += `<button class="btn-cta" onclick="window.open('${action.url}', '_blank')">${action.icon} ${action.text}</button>`;
        } else if (action.action === 'focus' && action.target) {
            html += `<button class="btn-cta" onclick="document.getElementById('${action.target}').focus()">${action.icon} ${action.text}</button>`;
        } else if (action.action === 'redirect' && action.target) {
            html += `<button class="btn-cta" onclick="showView('${action.target}')">${action.icon} ${action.text}</button>`;
        } else if (action.action === 'help') {
            html += `<button class="btn-cta" onclick="showTiendaNubeHelp()">${action.icon} ${action.text}</button>`;
        } else {
            html += `<button class="btn-cta">${action.icon} ${action.text}</button>`;
        }
    });

    html += '</div></div>';
    el.innerHTML = html;
}

function showTiendaNubeHelp() {
    const helpContent = `
        <h4>¿Cómo obtener credenciales de Tienda Nube?</h4>
        <ol>
            <li>Ve a <a href="https://www.tiendanube.com" target="_blank">tiendanube.com</a> y accede a tu tienda</li>
            <li>Ve a Configuración → API → Aplicaciones</li>
            <li>Crea una nueva aplicación o edita una existente</li>
            <li>En "Permisos", marca: Productos (lectura), Pedidos (lectura), Cupones (lectura)</li>
            <li>Genera el Access Token y cópialo inmediatamente</li>
            <li>El ID de tienda está en Configuración → Código de inserción</li>
        </ol>
    `;
    showNotification(false, 'Ayuda - Tienda Nube', helpContent);
}

// Tenant Edit/Delete Functions
function resetTenantModal() {
    document.getElementById('tenant-modal-title').textContent = 'Configuración de Tienda';
    document.getElementById('tenant-form').reset();
    document.getElementById('delete-tenant-btn').style.display = 'none';
    document.getElementById('delete-tenant-btn').onclick = null;
    populateTNStoreDropdown();
}

async function populateTNStoreDropdown() {
    const select = document.getElementById('tn-store-preset');
    if (!select) return; // Safety check

    // Clear existing options except the first two
    while (select.options.length > 2) {
        select.remove(2);
    }

    try {
        const tenants = await adminFetch('/admin/tenants');
        const storesWithTN = tenants.filter(t => t.tiendanube_store_id);

        // Note: In tenant modal, we don't add "Create new" since we're already creating a tenant
        // The dropdown is just for pre-filling with existing TN credentials

        // Add existing stores
        storesWithTN.forEach(tenant => {
            const option = document.createElement('option');
            option.value = `existing-${tenant.bot_phone_number}`;
            option.textContent = `${tenant.store_name} (${tenant.tiendanube_store_id})`;
            option.setAttribute('data-store-id', tenant.tiendanube_store_id);
            option.setAttribute('data-token', tenant.tiendanube_access_token || '');
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading Tienda Nube stores:', error);
    }
}

function updateTNFields() {
    const select = document.getElementById('tn-store-preset');
    const manualFields = document.getElementById('tn-manual-fields');
    const selectedValue = select.value;

    if (selectedValue === 'custom' || selectedValue === 'create-new') {
        manualFields.style.display = 'block';
        // Clear any pre-filled values
        document.querySelector('[name="tiendanube_store_id"]').value = '';
        document.querySelector('[name="tiendanube_access_token"]').value = '';
        if (selectedValue === 'create-new') {
            // Open tenant modal for creating new store
            closeModal('tenant-modal'); // Close current modal
            setTimeout(() => {
                openModal('tenant-modal');
                resetTenantModal();
            }, 100);
        }
    } else if (selectedValue.startsWith('existing-')) {
        manualFields.style.display = 'block';
        const selectedOption = select.options[select.selectedIndex];
        document.querySelector('[name="tiendanube_store_id"]').value = selectedOption.getAttribute('data-store-id');
        document.querySelector('[name="tiendanube_access_token"]').value = selectedOption.getAttribute('data-token');
    } else {
        manualFields.style.display = 'none';
    }
}

async function editTenant(phoneNumber) {
    console.log('Edit tenant called with:', phoneNumber); // Debug log

    try {
        const tenant = await adminFetch(`/admin/tenants/${phoneNumber}`);
        console.log('Tenant data received:', tenant); // Debug log

        if (tenant) {
            // Populate form
            const form = document.getElementById('tenant-form');
            if (form) {
                form.elements['store_name'].value = tenant.store_name || '';
                form.elements['bot_phone_number'].value = tenant.bot_phone_number || '';
                form.elements['tiendanube_store_id'].value = tenant.tiendanube_store_id || '';
                form.elements['tiendanube_access_token'].value = tenant.tiendanube_access_token || '';
                form.elements['store_description'].value = tenant.store_description || '';
                form.elements['store_catalog_knowledge'].value = tenant.store_catalog_knowledge || '';
                form.elements['store_location'].value = tenant.store_location || '';
                form.elements['store_website'].value = tenant.store_website || '';
                form.elements['owner_email'].value = tenant.owner_email || '';

                editingTenant = phoneNumber;
                const title = document.getElementById('tenant-modal-title');
                if (title) title.textContent = 'Editar Tienda';

                const deleteBtn = document.getElementById('delete-tenant-btn');
                if (deleteBtn) {
                    deleteBtn.style.display = 'inline-block';
                    deleteBtn.onclick = () => deleteTenant(phoneNumber);
                }

                openModal('tenant-modal');
                console.log('Modal opened successfully'); // Debug log
            } else {
                console.error('Tenant form not found');
                showNotification(false, 'Error', 'No se pudo encontrar el formulario de edición');
            }
        } else {
            console.error('No tenant data received');
            showNotification(false, 'Error', 'No se pudieron cargar los datos de la tienda');
        }
    } catch (error) {
        console.error('Error fetching tenant:', error);
        showNotification(false, 'Error', 'Error al cargar los datos de la tienda');
    }
}

// Consolidated deleteTenant above at line 648

async function testTenantConnection(botPhoneNumber) {
    if (!botPhoneNumber) return;

    showNotification(true, 'Iniciando Test', 'Enviando mensaje de prueba al bot...');

    try {
        const res = await adminFetch(`/admin/tenants/${botPhoneNumber}/test-message`, 'POST');
        if (res && res.status === 'ok') {
            showNotification(true, 'Test Exitoso', 'El mensaje de prueba se procesó correctamente.');
        } else {
            showNotification(false, 'Error de Test', 'El orquestador no pudo procesar el mensaje de prueba.');
        }
    } catch (error) {
        showNotification(false, 'Error de Conexión', `Error: ${error.message}`);
    }
}


async function deleteAllTenants() {
    if (!confirm('¿Estás seguro de que quieres ELIMINAR TODAS las tiendas? Esta acción no se puede deshacer.')) return;

    try {
        const result = await adminFetch('/admin/tenants', 'DELETE');
        if (result && result.status === 'ok') {
            showNotification(true, 'Todas las Tiendas Eliminadas', 'Base de datos limpia. Puedes empezar de cero.');
            loadTenants();
            updateStats();

            // Reset step 3 since no stores available
            resetStep3IfNeeded();
        } else {
            showNotification(false, 'Error', 'No se pudieron eliminar las tiendas');
        }
    } catch (error) {
        showNotification(false, 'Error', 'Error al eliminar tiendas');
    }
}

function checkAndResetStep3() {
    // Check if there are any tenants with Tienda Nube configured
    adminFetch('/admin/tenants').then(tenants => {
        const hasTNConfigured = tenants.some(t => t.tiendanube_store_id);
        if (!hasTNConfigured && stepStatuses[3] === 'ok') {
            // Reset step 3 to pending
            stepStatuses[3] = 'pending';
            updateStepUI();
            saveSetupProgress();
            showNotification(false, 'Paso 3 Reiniciado', 'Se eliminó la tienda conectada. El Paso 3 vuelve a pendiente.');
        }
    }).catch(error => {
        console.error('Error checking tenants for step reset:', error);
    });
}

function resetStep3IfNeeded() {
    if (stepStatuses[3] === 'ok') {
        stepStatuses[3] = 'pending';
        updateStepUI();
        saveSetupProgress();
        showNotification(false, 'Paso 3 Reiniciado', 'No hay tiendas con Tienda Nube configurada. El Paso 3 vuelve a pendiente.');
    }
}

// Mobile UI Functions
function toggleCollapsible(id) {
    const element = document.getElementById(id);
    element.classList.toggle('collapsed');
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');

    if (sidebar.classList.contains('visible')) {
        sidebar.classList.remove('visible');
        toggleBtn.style.transform = 'translateX(-50%)';
    } else {
        sidebar.classList.add('visible');
        toggleBtn.style.transform = 'translateX(-50%) translateY(-10px)';
    }
}

// Auto-hide sidebar after 3 seconds of inactivity on mobile
let sidebarTimeout;
function resetSidebarTimeout() {
    if (window.innerWidth <= 768) {
        clearTimeout(sidebarTimeout);
        sidebarTimeout = setTimeout(() => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar.classList.contains('visible')) {
                toggleSidebar();
            }
        }, 3000);
    }
}

// Add touch gesture for sidebar
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    if (window.innerWidth <= 768) {
        touchStartY = e.touches[0].clientY;
    }
});

document.addEventListener('touchend', (e) => {
    if (window.innerWidth <= 768) {
        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;

        // Swipe up gesture (more than 50px)
        if (diff > 50) {
            const toggleBtn = document.getElementById('sidebar-toggle');
            const rect = toggleBtn.getBoundingClientRect();
            if (e.changedTouches[0].clientX >= rect.left &&
                e.changedTouches[0].clientX <= rect.right &&
                e.changedTouches[0].clientY >= rect.top &&
                e.changedTouches[0].clientY <= rect.bottom) {
                toggleSidebar();
            }
        }
    }
});

// Reset timeout on user interaction
document.addEventListener('click', resetSidebarTimeout);
document.addEventListener('touchstart', resetSidebarTimeout);

// WhatsApp Meta Form
document.getElementById('whatsapp-meta-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Ensure all fields are included, even if empty
    const form = e.target;
    ['name', 'value', 'category', 'description', 'scope', 'tenant_id'].forEach(field => {
        if (!(field in data)) {
            data[field] = form.elements[field]?.value || '';
        }
    });

    // For global scope, ensure tenant_id is not set
    if (data.scope === 'global') {
        data.tenant_id = null;
    }

    const scope = data.tenant_id ? 'tenant' : 'global';
    const tenant_id = data.tenant_id ? parseInt(data.tenant_id) : null;

    try {
        // Store as credentials
        await adminFetch('/admin/credentials', 'POST', {
            name: "WHATSAPP_ACCESS_TOKEN",
            value: data.access_token,
            category: "whatsapp_meta",
            scope: scope,
            tenant_id: tenant_id,
            description: "Meta API Access Token"
        });
        await adminFetch('/admin/credentials', 'POST', {
            name: "WHATSAPP_PHONE_NUMBER_ID",
            value: data.phone_number_id,
            category: "whatsapp_meta",
            scope: scope,
            tenant_id: tenant_id,
            description: "Meta API Phone Number ID"
        });
        await adminFetch('/admin/credentials', 'POST', {
            name: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            value: data.business_account_id,
            category: "whatsapp_meta",
            scope: scope,
            tenant_id: tenant_id,
            description: "Meta API Business Account ID"
        });

        await adminFetch('/admin/credentials', 'POST', {
            name: "WHATSAPP_VERIFY_TOKEN",
            value: data.verify_token,
            category: "whatsapp_meta",
            scope: scope,
            tenant_id: tenant_id,
            description: "Webhook Verify Token"
        });

        showNotification(true, 'WhatsApp Meta API Configurado', 'Las credenciales de WhatsApp Meta API se guardaron correctamente.');
        closeModal('whatsapp-meta-modal');
    } catch (error) {
        showNotification(false, 'Error', 'Error al guardar la configuración de WhatsApp Meta API');
    }
});

// Setup Wizard Functions - Session-Based for Self-Hosted Deployments
let currentSetupSession = null;
let setupSessionId = null;

async function startSetupWizard() {
    try {
        // Create new setup session
        const sessionData = {
            public_base_url: window.location.origin,
            webhook_base_url: `${window.location.origin}/webhook`
        };

        const sessionResult = await adminFetch('/admin/setup/session', 'POST', sessionData);
        if (sessionResult.status === 'ok') {
            setupSessionId = sessionResult.session_id;
            currentSetupSession = sessionResult;

            // Start with preflight step
            await runPreflightStep();
        } else {
            showNotification(false, 'Error', 'No se pudo crear la sesión de configuración');
            return;
        }
    } catch (error) {
        console.error('Error creating setup session:', error);
        showNotification(false, 'Error', 'Error al iniciar el asistente de configuración');
        return;
    }

    showView('setup');
}

async function runPreflightStep() {
    try {
        // Show loading
        document.getElementById('setup-content').innerHTML = `
            <div class="preflight-loading">
                <h2 class="setup-step-title">Verificando Infraestructura</h2>
                <p class="setup-step-description">Validando configuración de red, TLS, base de datos y servicios...</p>
                <div class="preflight-progress">
                    <div class="progress-spinner"></div>
                    <p>Esto puede tomar unos segundos...</p>
                </div>
            </div>
        `;

        // Run preflight checks
        const preflightResult = await adminFetch('/admin/setup/preflight', 'POST', { session_id: setupSessionId });

        if (preflightResult.overall_status === 'OK') {
            // All checks passed - show success and continue
            await showPreflightResults(preflightResult, true);
        } else {
            // Some checks failed - show results and solutions
            await showPreflightResults(preflightResult, false);
        }
    } catch (error) {
        console.error('Preflight error:', error);
        document.getElementById('setup-content').innerHTML = `
            <div class="preflight-error">
                <h2 class="setup-step-title">Error en Verificación</h2>
                <p class="setup-step-description">No se pudieron ejecutar las verificaciones de infraestructura.</p>
                <div class="error-details">${error.message}</div>
                <button class="btn-secondary" onclick="runPreflightStep()">Reintentar</button>
            </div>
        `;
    }
}

async function showPreflightResults(results, allPassed) {
    const checksHtml = Object.entries(results.checks).map(([checkName, checkResult]) => {
        const statusClass = checkResult.status === 'OK' ? 'check-pass' :
            checkResult.status === 'WARN' ? 'check-warn' : 'check-fail';
        const statusIcon = checkResult.status === 'OK' ? '✅' :
            checkResult.status === 'WARN' ? '⚠️' : '❌';

        return `
            <div class="preflight-check ${statusClass}">
                <div class="check-header">
                    <span class="check-icon">${statusIcon}</span>
                    <span class="check-name">${checkName.replace(/_/g, ' ').toUpperCase()}</span>
                    <span class="check-status">${checkResult.status}</span>
                </div>
                <div class="check-message">${checkResult.message}</div>
                ${checkResult.solution ? `<div class="check-solution">💡 ${checkResult.solution}</div>` : ''}
            </div>
        `;
    }).join('');

    const content = `
        <h2 class="setup-step-title">${allPassed ? '✅ Infraestructura Verificada' : '⚠️ Problemas Detectados'}</h2>
        <p class="setup-step-description">
            ${allPassed ?
            'Tu infraestructura está correctamente configurada. Puedes continuar con la configuración.' :
            'Se encontraron problemas en la configuración. Resuélvelos antes de continuar.'}
        </p>
        <div class="preflight-results">
            ${checksHtml}
        </div>
        <div class="preflight-actions">
            ${allPassed ?
            '<button class="btn-primary" onclick="proceedToNextStep()">Continuar con Configuración</button>' :
            '<button class="btn-secondary" onclick="runPreflightStep()">Reverificar</button>'}
        </div>
    `;

    document.getElementById('setup-content').innerHTML = content;
}

async function proceedToNextStep() {
    // Show service selection modal instead of going directly to overview
    await checkServiceStatuses();
    openModal('service-selection-modal');
}

async function checkServiceStatuses() {
    try {
        // Check Tienda Nube status
        const tenants = await adminFetch('/admin/tenants');
        const hasTiendaNube = tenants && tenants.length > 0;

        updateServiceStatus('tn', hasTiendaNube);

        // Check YCloud and Meta API status - get all credentials and filter
        const allCreds = await adminFetch('/admin/credentials');

        // Check YCloud status
        const ycloudApiKey = allCreds && allCreds.find(c => c.name === 'YCLOUD_API_KEY');
        const ycloudSecret = allCreds && allCreds.find(c => c.name === 'YCLOUD_WEBHOOK_SECRET');
        const ycloudConfigured = ycloudApiKey && ycloudSecret;
        updateServiceStatus('ycloud', ycloudConfigured);

        // Check Meta API status
        const metaToken = allCreds && allCreds.find(c => c.name === 'WHATSAPP_ACCESS_TOKEN');
        const metaPhoneId = allCreds && allCreds.find(c => c.name === 'WHATSAPP_PHONE_NUMBER_ID');
        const metaConfigured = metaToken && metaPhoneId;
        updateServiceStatus('meta', metaConfigured);

    } catch (error) {
        console.error('Error checking service statuses:', error);
        // Default to not configured
        updateServiceStatus('tn', false);
        updateServiceStatus('ycloud', false);
        updateServiceStatus('meta', false);
    }
}

function updateServiceStatus(service, isConfigured) {
    const statusElement = document.getElementById(`${service}-status`);
    const cardElement = document.getElementById(`${service}-service-card`);
    const dotElement = statusElement.querySelector('.status-dot');
    const textElement = statusElement.querySelector('.status-text');

    if (isConfigured) {
        cardElement.classList.add('configured');
        cardElement.classList.remove('not-configured');
        dotElement.classList.add('configured');
        dotElement.classList.remove('not-configured');
        textElement.textContent = 'Configurado';
        textElement.style.color = 'var(--success)';
    } else {
        cardElement.classList.add('not-configured');
        cardElement.classList.remove('configured');
        dotElement.classList.add('not-configured');
        dotElement.classList.remove('configured');
        textElement.textContent = 'No configurado';
        textElement.style.color = '#ff4d4d';
    }
}

function selectService(service) {
    closeModal('service-selection-modal');

    // Navigate to the appropriate configuration page
    switch (service) {
        case 'tiendanube':
            showView('stores');
            break;
        case 'ycloud':
            showView('ycloud');
            break;
        case 'whatsapp-meta':
            showView('whatsapp-meta');
            break;
        default:
            showView('overview');
    }

    showNotification(true, 'Redirigiendo...', `Configurando ${getServiceName(service)}`);
}

function getServiceName(service) {
    switch (service) {
        case 'tiendanube': return 'Tienda Nube';
        case 'ycloud': return 'WhatsApp (YCloud)';
        case 'whatsapp-meta': return 'WhatsApp Meta API';
        default: return 'servicio';
    }
}

async function saveSetupProgress() {
    try {
        await adminFetch('/admin/setup/state', 'POST', {
            currentStep,
            stepStatuses
        });
        console.log('Setup progress saved to backend');
    } catch (error) {
        console.error('Failed to save setup progress:', error);
    }
}

// Setup progress is now managed server-side via /setup/state endpoint
// No localStorage needed to prevent inconsistencies

function updateStepUI() {
    // Update progress bar
    const completedSteps = Object.values(stepStatuses).filter(status => status === 'ok').length;
    const progressPercent = (completedSteps / 7) * 100;
    document.getElementById('progress-fill').style.width = `${progressPercent}%`;

    // Update step indicators
    for (let i = 1; i <= 7; i++) {
        const stepElement = document.getElementById(`step-${i}`);
        stepElement.className = 'setup-step';
        if (stepStatuses[i] === 'ok') {
            stepElement.classList.add('completed');
        } else if (i === currentStep) {
            stepElement.classList.add('active');
        }
    }

    // Update step status displays
    for (let i = 1; i <= 7; i++) {
        const statusElement = document.getElementById(`step-${i}-status`);
        const statusText = statusElement.querySelector('.status-text');
        statusText.textContent = getStatusText(stepStatuses[i]);
        statusText.className = `status-text ${stepStatuses[i]}`;
    }
}

function getStatusText(status) {
    switch (status) {
        case 'ok': return 'Completado';
        case 'warn': return 'Advertencia';
        case 'error': return 'Error';
        default: return 'Pendiente';
    }
}

async function runStepTest(stepNumber) {
    const correlationId = `setup-test-${Date.now()}`;

    try {
        let result;

        switch (stepNumber) {
            case 1:
                // Check OpenAI configuration
                result = await adminFetch('/admin/diagnostics/openai/test');
                if (result && result.status === 'OK') {
                    stepStatuses[1] = 'ok';
                    showNotification(true, 'Paso 1 Completado', 'OpenAI configurado correctamente.');
                } else {
                    stepStatuses[1] = 'error';
                    showNotification(false, 'Error en Paso 1', 'OpenAI no está configurado. Ve a Credenciales y agrega OPENAI_API_KEY.');
                }
                break;

            case 2:
                // Check YCloud configuration
                result = await adminFetch('/admin/diagnostics/ycloud/test');
                if (result && result.status === 'OK') {
                    stepStatuses[2] = 'ok';
                    showNotification(true, 'Paso 2 Completado', 'YCloud configurado correctamente.');
                } else {
                    stepStatuses[2] = 'error';
                    showNotification(false, 'Error en Paso 2', 'YCloud no está configurado. Ve a WhatsApp (YCloud) y configura las credenciales.');
                }
                break;

            case 3:
                // Check if tenant exists
                const tenants = await adminFetch('/admin/tenants');
                if (tenants && tenants.length > 0) {
                    stepStatuses[3] = 'ok';
                    showNotification(true, 'Paso 3 Completado', 'Tienda configurada correctamente.');
                } else {
                    stepStatuses[3] = 'error';
                    showNotification(false, 'Error en Paso 3', 'No hay tiendas configuradas. Crea una tienda primero.');
                }
                break;

            case 4:
                // Test overall connection
                result = await adminFetch('/admin/diagnostics/healthz');
                if (result && result.status === 'OK') {
                    stepStatuses[4] = 'ok';
                    showNotification(true, 'Paso 4 Completado', 'Todos los servicios están conectados.');
                } else if (result && result.status === 'WARN') {
                    stepStatuses[4] = 'warn';
                    showNotification(true, 'Paso 4 Completado con Advertencias', 'Servicios básicos OK, pero hay configuraciones pendientes.');
                } else {
                    stepStatuses[4] = 'error';
                    showNotification(false, 'Error en Paso 4', 'Problemas de conexión. Verifica la configuración.');
                }
                break;

            case 5:
                // Send test WhatsApp message
                const testNumber = prompt('Ingresa tu número de WhatsApp para la prueba (+549XXXXXXXXXX):');
                if (testNumber) {
                    result = await adminFetch('/admin/diagnostics/whatsapp/send_test', 'POST', {
                        to: testNumber,
                        text: 'CodExy test: reply PING',
                        correlation_id: correlationId
                    });
                    if (result && result.status === 'OK') {
                        stepStatuses[5] = 'ok';
                        showNotification(true, 'Paso 5 Completado', 'Mensaje de prueba enviado. Responde "PING" desde WhatsApp.');
                    } else {
                        stepStatuses[5] = 'error';
                        showNotification(false, 'Error en Paso 5', result?.error || 'Error al enviar mensaje de prueba.');
                    }
                }
                break;
        }

        updateStepUI();
        saveSetupProgress();
    } catch (error) {
        stepStatuses[stepNumber] = 'error';
        updateStepUI();
        saveSetupProgress();
        showNotification(false, `Error en Paso ${stepNumber}`, `Error de conexión: ${error.message}`);
    }
}

function startWebhookMonitoring(correlationId) {
    // Poll for webhook events
    const checkInterval = setInterval(async () => {
        try {
            const events = await adminFetch('/admin/diagnostics/events/stream?limit=10');
            if (events && events.events) {
                const webhookEvent = events.events.find(e =>
                    e.event_type === 'webhook_received' &&
                    e.correlation_id === correlationId
                );

                if (webhookEvent) {
                    stepStatuses[5] = 'ok';
                    document.getElementById('webhook-waiting').style.display = 'none';
                    showNotification(true, 'Paso 5 Completado', 'Webhook recibido correctamente.');
                    clearInterval(checkInterval);
                    updateStepUI();

                    // Check for bot response
                    setTimeout(() => checkBotResponse(correlationId), 2000);
                }
            }
        } catch (error) {
            console.error('Error checking webhook:', error);
        }
    }, 3000);

    // Stop checking after 2 minutes
    setTimeout(() => {
        clearInterval(checkInterval);
        if (stepStatuses[5] === 'pending') {
            stepStatuses[5] = 'error';
            document.getElementById('webhook-waiting').style.display = 'none';
            showNotification(false, 'Error en Paso 5', 'No se recibió el webhook en el tiempo esperado.');
            updateStepUI();
        }
    }, 120000);
}

function checkBotResponse(correlationId) {
    const checkInterval = setInterval(async () => {
        try {
            const events = await adminFetch('/admin/diagnostics/events/stream?limit=10');
            if (events && events.events) {
                const responseEvent = events.events.find(e =>
                    e.event_type === 'agent_response_sent' &&
                    e.correlation_id === correlationId
                );

                if (responseEvent) {
                    stepStatuses[6] = 'ok';
                    showNotification(true, 'Paso 6 Completado', 'Respuesta del bot generada correctamente.');
                    clearInterval(checkInterval);
                    updateStepUI();
                }
            }
        } catch (error) {
            console.error('Error checking bot response:', error);
        }
    }, 2000);

    // Stop checking after 30 seconds
    setTimeout(() => {
        clearInterval(checkInterval);
        if (stepStatuses[6] === 'pending') {
            stepStatuses[6] = 'error';
            showNotification(false, 'Error en Paso 6', 'El bot no respondió en el tiempo esperado.');
            updateStepUI();
        }
    }, 30000);
}

function goToOverview() {
    showView('overview');
}

// Console Management
let consoleStreamingInterval = null;
let autoScrollEnabled = true;

async function loadConsoleEvents() {
    const container = document.getElementById('console-output');
    container.innerHTML = '<div class="console-loading">Cargando eventos...</div>';

    try {
        const response = await adminFetch('/admin/console/events?limit=50');
        displayConsoleEvents(response.events || []);
    } catch (error) {
        container.innerHTML = `<div class="console-error">Error cargando eventos: ${error.message}</div>`;
    }
}

function displayConsoleEvents(events) {
    const container = document.getElementById('console-output');

    if (events.length === 0) {
        container.innerHTML = '<div class="console-empty">No hay eventos recientes</div>';
        return;
    }

    const eventsHtml = events.map(event => {
        const timestamp = new Date(event.timestamp).toLocaleString();
        const severityClass = `severity-${event.severity || 'info'}`;
        const sourceIcon = getSourceIcon(event.source);

        return `
            <div class="console-event ${severityClass}">
                <div class="event-header">
                    <span class="event-time">${timestamp}</span>
                    <span class="event-type">${event.event_type}</span>
                    <span class="event-severity">${event.severity || 'info'}</span>
                    <span class="event-source">${sourceIcon} ${event.source}</span>
                </div>
                <div class="event-details">
                    ${event.correlation_id ? `<div class="event-correlation">ID: ${event.correlation_id}</div>` : ''}
                    ${formatEventDetails(event.details)}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = eventsHtml;

    if (autoScrollEnabled) {
        container.scrollTop = container.scrollHeight;
    }
}

function getSourceIcon(source) {
    const icons = {
        'telemetry': '📊',
        'whatsapp': '📱',
        'agent': '🤖',
        'system': '⚙️'
    };
    return icons[source] || '📝';
}

function formatEventDetails(details) {
    if (!details) return '';

    let html = '';

    if (details.from_number) {
        html += `<div class="detail-item">📞 De: ${details.from_number}</div>`;
    }

    if (details.message) {
        const truncated = details.message.length > 100 ?
            details.message.substring(0, 100) + '...' : details.message;
        html += `<div class="detail-item">💬 ${truncated}</div>`;
    }

    if (details.session_id) {
        html += `<div class="detail-item">🔗 Sesión: ${details.session_id}</div>`;
    }

    if (details.success !== undefined) {
        const successIcon = details.success ? '✅' : '❌';
        html += `<div class="detail-item">${successIcon} Éxito: ${details.success}</div>`;
    }

    if (details.duration_ms) {
        html += `<div class="detail-item">⏱️ Duración: ${details.duration_ms}ms</div>`;
    }

    if (details.error_code) {
        html += `<div class="detail-item">⚠️ Error: ${details.error_code}</div>`;
    }

    if (details.error_message) {
        html += `<div class="detail-item">📝 ${details.error_message}</div>`;
    }

    return html;
}

function startConsoleStreaming() {
    if (consoleStreamingInterval) {
        clearInterval(consoleStreamingInterval);
    }

    consoleStreamingInterval = setInterval(async () => {
        try {
            const severity = document.getElementById('severity-filter').value;
            const type = document.getElementById('type-filter').value;
            const search = document.getElementById('search-filter').value;

            let url = '/admin/console/events?limit=50';
            if (severity) url += `&severity=${severity}`;
            if (type) url += `&event_type=${type}`;
            if (search) url += `&search=${search}`;

            const response = await adminFetch(url);
            displayConsoleEvents(response.events || []);
        } catch (error) {
            console.error('Error streaming console events:', error);
        }
    }, 2000); // Update every 2 seconds

    showNotification(true, 'Streaming Iniciado', 'La consola está actualizando eventos en tiempo real.');
}

function stopConsoleStreaming() {
    if (consoleStreamingInterval) {
        clearInterval(consoleStreamingInterval);
        consoleStreamingInterval = null;
        showNotification(true, 'Streaming Detenido', 'La actualización automática se ha detenido.');
    }
}

function clearConsole() {
    document.getElementById('console-output').innerHTML = '<div class="console-empty">Consola limpiada</div>';
    showNotification(true, 'Consola Limpiada', 'Todos los eventos han sido eliminados de la vista.');
}

function toggleAutoScroll() {
    autoScrollEnabled = !autoScrollEnabled;
    const button = document.querySelector('button[onclick="toggleAutoScroll()"]');
    if (button) {
        button.textContent = autoScrollEnabled ? '📜 Auto-scroll' : '📌 Scroll Manual';
    }
    showNotification(true, 'Auto-scroll', autoScrollEnabled ? 'Activado' : 'Desactivado');
}

function applyConsoleFilters() {
    // Re-load events with current filters
    if (consoleStreamingInterval) {
        // If streaming is active, it will automatically apply filters
        return;
    }

    loadConsoleEvents();
}

// Tenant Detail Modal Functions
async function openTenantDetailModal(tenantId) {
    console.log('Opening tenant detail modal for ID:', tenantId);
    try {
        // Fetch tenant details
        const details = await adminFetch(`/admin/tenants/${tenantId}/details`);
        console.log('Tenant details received:', details);

        if (details) {
            // Populate tenant info
            document.getElementById('detail-store-name').textContent = details.tenant.store_name || 'Sin nombre';
            document.getElementById('detail-phone-number').textContent = details.tenant.bot_phone_number || 'Sin número';
            document.getElementById('detail-owner-email').textContent = details.tenant.owner_email || 'Sin email';
            document.getElementById('detail-tn-store-id').textContent = details.tenant.tiendanube_store_id || 'Sin configurar';
            document.getElementById('detail-location').textContent = details.tenant.store_location || 'Sin ubicación';
            document.getElementById('detail-website').textContent = details.tenant.store_website || 'Sin sitio web';

            // Update WhatsApp status blocks
            updateWhatsAppStatusBlocks(details.connections.whatsapp);

            // Populate credentials
            populateTenantCredentials(details.credentials);

            // Store tenant ID for edit button
            window.currentTenantDetailId = tenantId;

            // Show modal
            openModal('tenant-detail-modal');
        }
    } catch (error) {
        showNotification(false, 'Error', 'No se pudieron cargar los detalles del tenant');
        console.error('Error loading tenant details:', error);
    }
}

function updateWhatsAppStatusBlocks(whatsappStatus) {
    // YCloud status
    const ycloudBlock = document.getElementById('ycloud-status-block');
    const ycloudIndicator = document.getElementById('ycloud-indicator');
    const ycloudDot = ycloudIndicator.querySelector('.status-dot');
    const ycloudText = ycloudIndicator.querySelector('.status-text');
    const ycloudDetails = document.getElementById('ycloud-details');

    if (whatsappStatus.ycloud.configured) {
        ycloudDot.className = 'status-dot connected';
        ycloudText.textContent = 'Conectado';
        ycloudDetails.innerHTML = `
            <div>API Key: ***${whatsappStatus.ycloud.api_key_masked || '****'}</div>
            <div>Webhook Secret: ***${whatsappStatus.ycloud.webhook_secret_masked || '****'}</div>
        `;
    } else {
        ycloudDot.className = 'status-dot not-connected';
        ycloudText.textContent = 'No configurado';
        ycloudDetails.innerHTML = '<div>Haz clic en "WhatsApp (YCloud)" para configurar</div>';
    }

    // Meta API status
    const metaBlock = document.getElementById('meta-status-block');
    const metaIndicator = document.getElementById('meta-indicator');
    const metaDot = metaIndicator.querySelector('.status-dot');
    const metaText = metaIndicator.querySelector('.status-text');
    const metaDetails = document.getElementById('meta-details');

    if (whatsappStatus.meta_api.configured) {
        metaDot.className = 'status-dot connected';
        metaText.textContent = 'Conectado';
        metaDetails.innerHTML = `
            <div>Phone ID: ***${whatsappStatus.meta_api.phone_number_id_masked || '****'}</div>
            <div>Business Account: ***${whatsappStatus.meta_api.business_account_id_masked || '****'}</div>
        `;
    } else {
        metaDot.className = 'status-dot not-connected';
        metaText.textContent = 'No configurado';
        metaDetails.innerHTML = '<div>Haz clic en "WhatsApp Meta API" para configurar</div>';
    }
}

function populateTenantCredentials(credentials) {
    const tenantList = document.getElementById('tenant-credentials-list');
    const globalList = document.getElementById('global-credentials-list');

    // Clear existing
    tenantList.innerHTML = '';
    globalList.innerHTML = '';

    // Populate tenant-specific credentials
    if (credentials.tenant_specific && credentials.tenant_specific.length > 0) {
        credentials.tenant_specific.forEach(cred => {
            const item = document.createElement('div');
            item.className = 'credential-item';
            item.innerHTML = `
                <div class="credential-info">
                    <div class="credential-name">${cred.name}</div>
                    <div class="credential-scope">Tenant-Specific</div>
                </div>
                <div class="credential-value">••••••••</div>
            `;
            tenantList.appendChild(item);
        });
    } else {
        tenantList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay credenciales específicas para este tenant</div>';
    }

    // Populate global credentials
    if (credentials.global_available && credentials.global_available.length > 0) {
        credentials.global_available.forEach(cred => {
            const item = document.createElement('div');
            item.className = 'credential-item';
            item.innerHTML = `
                <div class="credential-info">
                    <div class="credential-name">${cred.name}</div>
                    <div class="credential-scope">Global</div>
                </div>
                <div class="credential-value">••••••••</div>
            `;
            globalList.appendChild(item);
        });
    } else {
        globalList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay credenciales globales disponibles</div>';
    }
}

function showCredentialTab(tab) {
    const tenantTab = document.getElementById('tenant-credentials-list');
    const globalTab = document.getElementById('global-credentials-list');
    const tenantBtn = document.querySelector('.tab-btn[onclick*="tenant"]');
    const globalBtn = document.querySelector('.tab-btn[onclick*="global"]');

    if (tab === 'tenant') {
        tenantTab.style.display = 'block';
        globalTab.style.display = 'none';
        tenantBtn.classList.add('active');
        globalBtn.classList.remove('active');
    } else {
        tenantTab.style.display = 'none';
        globalTab.style.display = 'block';
        tenantBtn.classList.remove('active');
        globalBtn.classList.add('active');
    }
}

function editTenantFromDetail() {
    if (window.currentTenantDetailId) {
        closeModal('tenant-detail-modal');
        editTenant(window.currentTenantDetailId);
    }
}

// Make tenant table rows clickable
function makeTenantRowsClickable() {
    const table = document.getElementById('tenants-list');
    if (table) {
        table.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.tenantId) {
                openTenantDetailModal(row.dataset.tenantId);
            }
        });
    }
}

// Update loadTenants to add data attributes for click handling
const originalLoadTenants = loadTenants;
loadTenants = async function () {
    const tenants = await adminFetch('/admin/tenants');
    const container = document.getElementById('tenants-list');
    container.innerHTML = '';

    if (tenants) {
        tenants.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600">${t.store_name}</div>
                    <div style="font-size: 11px; color: #a1a1aa">${t.owner_email || 'No email'}</div>
                </td>
                <td>${t.bot_phone_number}</td>
                <td>${t.tiendanube_store_id || 'N/A'}</td>
                <td><span class="status-badge ${t.tiendanube_store_id ? 'ok' : 'error'}" style="background: ${t.tiendanube_store_id ? 'rgba(0,230,118,0.1)' : 'rgba(244,67,54,0.1)'}; color: ${t.tiendanube_store_id ? '#00e676' : '#f44336'}">${t.tiendanube_store_id ? 'Activo' : 'Sin Configurar'}</span></td>
                <td>
                    <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px" onclick="editTenant('${t.bot_phone_number}')">Editar</button>
                    <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px" onclick="testTenantConnection('${t.bot_phone_number}', '${t.tiendanube_store_id}', '${t.tiendanube_access_token}')">Test</button>
                    <button class="btn-delete" style="padding: 5px 12px; font-size: 12px" onclick="deleteTenant('${t.bot_phone_number}')">Eliminar</button>
                </td>
            `;

            // Add data attributes for click handling
            tr.dataset.tenantId = t.id; // Use the numeric ID
            tr.dataset.tenantPhone = t.bot_phone_number; // Keep phone for backward compatibility
            tr.style.cursor = 'pointer';
            tr.title = 'Haz clic para ver detalles';
            console.log('Created tenant row with ID:', t.id, 'for tenant:', t.store_name);

            // Add click event listener to the row
            tr.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons
                if (e.target.tagName === 'BUTTON') {
                    return;
                }
                openTenantDetailModal(t.id); // Pass the numeric ID
            });

            container.appendChild(tr);
        });
    }
};

// YCloud form submit
document.getElementById('ycloud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    // Save as tenant-specific credentials
    const credData1 = {
        name: 'YCLOUD_API_KEY',
        value: data.api_key,
        scope: 'tenant',
        tenant_id: parseInt(data.tenant_id)
    };
    await adminFetch('/admin/credentials', 'POST', credData1);
    const credData2 = {
        name: 'YCLOUD_WEBHOOK_SECRET',
        value: data.webhook_secret,
        scope: 'tenant',
        tenant_id: parseInt(data.tenant_id)
    };
    await adminFetch('/admin/credentials', 'POST', credData2);
    showNotification(true, 'YCloud Configurado', 'Credenciales guardadas correctamente.');
    closeModal('ycloud-config-modal');
});

// WhatsApp Meta form submit
document.getElementById('whatsapp-meta-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const creds = [
        { name: 'WHATSAPP_ACCESS_TOKEN', value: data.access_token },
        { name: 'WHATSAPP_PHONE_NUMBER_ID', value: data.phone_number_id },
        { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', value: data.business_account_id },
        { name: 'WHATSAPP_VERIFY_TOKEN', value: data.verify_token }
    ];
    for (const cred of creds) {
        await adminFetch('/admin/credentials', 'POST', {
            name: cred.name,
            value: cred.value,
            scope: 'tenant',
            tenant_id: parseInt(data.tenant_id)
        });
    }
    showNotification(true, 'WhatsApp Meta API Configurado', 'Credenciales guardadas correctamente.');
    closeModal('whatsapp-meta-modal');
});

// Load existing YCloud config
async function loadYCloudConfig() {
    try {
        const creds = await adminFetch('/admin/credentials');
        const apiKey = creds.find(c => c.name === 'YCLOUD_API_KEY');
        const webhookSecret = creds.find(c => c.name === 'YCLOUD_WEBHOOK_SECRET');

        const form = document.getElementById('ycloud-form');
        if (apiKey) form.elements['api_key'].value = apiKey.value;
        if (webhookSecret) form.elements['webhook_secret'].value = webhookSecret.value;
        if (apiKey && apiKey.tenant_id) form.elements['tenant_id'].value = apiKey.tenant_id;
    } catch (error) {
        console.error('Error loading YCloud config:', error);
    }
}

// Load existing Meta config
async function loadMetaConfig() {
    try {
        const creds = await adminFetch('/admin/credentials');
        const form = document.getElementById('whatsapp-meta-form');

        const token = creds.find(c => c.name === 'WHATSAPP_ACCESS_TOKEN');
        const phoneId = creds.find(c => c.name === 'WHATSAPP_PHONE_NUMBER_ID');
        const bizId = creds.find(c => c.name === 'WHATSAPP_BUSINESS_ACCOUNT_ID');
        const verToken = creds.find(c => c.name === 'WHATSAPP_VERIFY_TOKEN');

        if (token) form.elements['access_token'].value = token.value;
        if (phoneId) form.elements['phone_number_id'].value = phoneId.value;
        if (bizId) form.elements['business_account_id'].value = bizId.value;
        if (verToken) form.elements['verify_token'].value = verToken.value;
        if (token && token.tenant_id) form.elements['tenant_id'].value = token.tenant_id;
    } catch (error) {
        console.error('Error loading Meta config:', error);
    }
}

// --- Analytics Logic ---

async function loadAnalytics() {
    console.log('Loading Analytics...');
    const tenantId = document.getElementById('analytics-tenant-filter').value;
    const days = document.getElementById('analytics-time-filter').value || 30;

    // Show loading state for KPIs
    ['kpi-conversations', 'kpi-messages', 'kpi-success-rate', 'kpi-avg-response'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="loading-dots">...</span>';
    });

    try {
        // 1. Fetch Summary KPIs
        let summaryUrl = `/admin/analytics/summary?from_date=${getDateString(days)}`;
        if (tenantId) {
            summaryUrl += `&tenant_id=${tenantId}`;
        }

        const summary = await adminFetch(summaryUrl);

        if (summary && summary.kpis) {
            updateKPIs(summary.kpis);
        } else {
            // Handle error or empty state
            showNotification(false, 'Info', 'No se recibieron datos de KPIs.');
        }

        // 2. Fetch Chats for Charting (Conversations per Day)
        const chats = await adminFetch('/admin/chats');
        if (chats) {
            renderConversationsChart(chats, days);
        }

        // 3. Fetch Events for Table
        loadAnalyticsEvents();

    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification(false, 'Error', 'No se pudieron cargar las métricas. Revisa la consola.');
    }
}

function updateKPIs(kpis) {
    // Conversations
    const active = kpis.conversations.active || 0;
    const blocked = kpis.conversations.blocked || 0;
    animateValue('kpi-conversations', 0, active + blocked, 1000);

    // Messages
    const totalMsgs = kpis.messages.total || 0;
    animateValue('kpi-messages', 0, totalMsgs, 1000);

    // Success Rate (AI / Total)
    const aiMsgs = kpis.messages.ai || 0;
    const rate = totalMsgs > 0 ? Math.round((aiMsgs / totalMsgs) * 100) : 0;
    document.getElementById('kpi-success-rate').textContent = `${rate}%`;

    // Avg Response (Mock for now as backend doesn't provide it)
    document.getElementById('kpi-avg-response').textContent = '1.2s';
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function getDateString(daysBack) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().split('T')[0];
}

/* Render Simple Bar Chart */
function renderConversationsChart(chats, days) {
    const container = document.getElementById('conversations-chart');
    if (!container) return;

    // Group by Date
    const groups = {};
    // Initialize last N days
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // e.g. "Dec 21"
        groups[key] = 0;
    }

    // Bucketize chats
    chats.forEach(chat => {
        if (chat.last_message_at) {
            const date = new Date(chat.last_message_at);
            const key = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (groups[key] !== undefined) {
                groups[key]++;
            }
        }
    });

    // Determine max for scaling
    const values = Object.values(groups);
    const maxVal = Math.max(...values, 1); // Avoid div by zero

    // HTML Construction
    let barsHtml = '';
    Object.entries(groups).forEach(([label, count]) => {
        const height = (count / maxVal) * 100;
        barsHtml += `
            <div class="bar-group" title="${count} conversaciones el ${label}">
                <div class="bar-value">${count > 0 ? count : ''}</div>
                <div class="bar" style="height: ${Math.max(height, 5)}%;"></div>
                <div class="bar-label">${label}</div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="simple-bar-chart">
            ${barsHtml}
        </div>
    `;
    container.style.background = 'none'; // Remove placeholder background/border if needed
}

async function loadAnalyticsEvents() {
    const tbody = document.getElementById('analytics-events');
    if (!tbody) return;

    try {
        const res = await adminFetch('/admin/console/events?limit=10');
        if (res && res.events && res.events.length > 0) {
            tbody.innerHTML = res.events.map(e => `
                <tr>
                    <td>${new Date(e.timestamp).toLocaleString()}</td>
                    <td><span class="severity-badge severity-${e.severity.toLowerCase()}">${e.event_type}</span></td>
                    <td>${e.severity}</td>
                    <td>${e.details.message || JSON.stringify(e.details)}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-row">
                        <div class="table-empty">
                            <div class="empty-icon">📋</div>
                            <p>No hay eventos recientes</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    } catch (e) {
        console.error('Error loading analytics events', e);
    }
}

async function loadAnalyticsTenants() {
    const select = document.getElementById('analytics-tenant-filter');
    if (!select) return;

    try {
        const tenants = await adminFetch('/admin/tenants');
        // Keep "All" option
        select.innerHTML = '<option value="">Todas las tiendas</option>';
        if (tenants) {
            tenants.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.store_name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

// Expose functions to global scope for HTML onclick
window.showView = showView;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleModalClick = handleModalClick;
window.resetTenantModal = resetTenantModal;
window.resetCredentialModal = resetCredentialModal;
window.editTenant = editTenant;
window.editCredential = editCredential;
window.deleteTenant = deleteTenant;
window.deleteCredential = deleteCredential;
window.testTenantConnection = testTenantConnection;
window.toggleCollapsible = toggleCollapsible;
window.toggleSidebar = toggleSidebar;
window.startSetupWizard = startSetupWizard;
window.runStepTest = runStepTest;
window.goToOverview = goToOverview;
window.connectInstance = connectInstance;
window.runDiagnostics = runDiagnostics;
window.startSetupWizard = startSetupWizard;
window.updateTNFields = updateTNFields;
window.deleteAllTenants = deleteAllTenants;
window.loadAnalytics = loadAnalytics;
window.clearConsole = clearConsole;
window.toggleAutoScroll = toggleAutoScroll;
window.startConsoleStreaming = startConsoleStreaming;
window.stopConsoleStreaming = stopConsoleStreaming;
window.applyConsoleFilters = applyConsoleFilters;
window.openTenantDetailModal = openTenantDetailModal;
window.showCredentialTab = showCredentialTab;
window.editTenantFromDetail = editTenantFromDetail;
window.selectService = selectService;
window.configureTool = configureTool;
window.deleteTool = deleteTool;
window.loadYCloudConfig = loadYCloudConfig;
window.testTenantConnection = testTenantConnection;
// --- Chats View Logic (Human-in-the-Loop) ---

let chatsCache = [];
let currentChatPhone = null;

// --- Chat View (Human-in-the-Loop) Logic ---

async function loadChats() {
    const listContainer = document.getElementById('chat-list-items');
    // Only show loading if empty to prevent flickering on poll
    if (listContainer.children.length === 0 || listContainer.innerHTML.includes('Cargando')) {
        listContainer.innerHTML = '<div class="chat-loading">Cargando conversaciones...</div>';
    }

    try {
        const chats = await adminFetch('/admin/chats');
        if (!chats || chats.length === 0) {
            listContainer.innerHTML = '<div class="chat-empty">No hay conversaciones activas</div>';
            return;
        }

        // Sort: Human Override active first, then by Last Message
        chats.sort((a, b) => {
            const aLocked = a.human_override_until && new Date(a.human_override_until) > new Date();
            const bLocked = b.human_override_until && new Date(b.human_override_until) > new Date();
            if (aLocked !== bLocked) return bLocked ? 1 : -1;
            return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
        });

        // Smart Render: Update existing or add new
        chats.forEach(chat => {
            let existing = document.querySelector(`.chat-item[data-id="${chat.id}"]`);
            const time = chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const isLocked = chat.human_override_until && new Date(chat.human_override_until) > new Date();
            const lockedIcon = isLocked ? '<span style="color: #ffd700; margin-right:5px;">👤</span>' : '';
            const statusClass = isLocked ? 'status-locked' : 'status-auto';
            const isActive = activeChatId === chat.id;

            const innerHTML = `
                <div class="chat-item-avatar">${chat.avatar_url || '👤'}</div>
                <div class="chat-item-info">
                    <div class="chat-item-header">
                        <span class="chat-name">${chat.display_name || chat.external_user_id}</span>
                        <span class="chat-time">${time}</span>
                    </div>
                    <div class="chat-preview">
                        ${lockedIcon} ${chat.last_message_preview || 'Nueva conversación'}
                    </div>
                </div>
                <div class="chat-status-indicator ${statusClass}"></div>
            `;

            if (existing) {
                if (existing.innerHTML !== innerHTML || existing.classList.contains('active') !== isActive) {
                    existing.innerHTML = innerHTML;
                    existing.className = `chat-item ${isActive ? 'active' : ''}`;
                }
            } else {
                const div = document.createElement('div');
                div.className = `chat-item ${isActive ? 'active' : ''}`;
                div.setAttribute('data-id', chat.id);
                div.onclick = () => selectChat(chat.id, chat);
                div.innerHTML = innerHTML;
                listContainer.appendChild(div);
            }
        });

        // Remove old chats if needed (unlikely in this context but good for consistency)
        document.querySelectorAll('.chat-item').forEach(el => {
            const id = el.getAttribute('data-id');
            if (!chats.find(c => c.id === id)) el.remove();
        });

    } catch (err) {
        console.error("Error loading chats:", err);
        if (listContainer.children.length === 0) {
            listContainer.innerHTML = `<div class="chat-error">Error: ${err.message}</div>`;
        }
    }
}

async function selectChat(chatId, chatObj = null) {
    activeChatId = chatId;

    // Resolve chatObj from global store if needed
    if (!chatObj && allChats.length > 0) {
        chatObj = allChats.find(c => c.id === chatId);
    }

    // UI Updates
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    // Find and highlight (might rely on next loadChats poll, but we force active class here if found)
    const activeItem = document.querySelector(`.chat-item[data-id="${chatId}"]`);
    if (activeItem) activeItem.classList.add('active');

    document.getElementById('chat-empty-state').style.display = 'none';
    document.getElementById('chat-interface').style.display = 'flex';

    if (chatObj) {
        document.getElementById('chat-current-phone').textContent = chatObj.display_name || chatObj.external_user_id;

        // Update Human Override Toggle State
        const toggle = document.getElementById('human-override-toggle');
        const label = document.getElementById('human-override-label');

        // Logic: Check is_locked (if backend sends it) OR timestamp logic
        // Ensuring we parse the timestamp correctly
        let isLocked = chatObj.is_locked;
        if (isLocked === undefined && chatObj.human_override_until) {
            isLocked = new Date(chatObj.human_override_until) > new Date();
        }

        toggle.checked = !!isLocked;
        if (isLocked) {
            label.innerText = "Atención Humana";
            label.style.color = "#ef4444"; // Red
        } else {
            label.innerText = "Agente Activo";
            label.style.color = "#22c55e"; // Green
        }
    }

    // Mobile View Toggle
    const layout = document.querySelector('.chats-layout');
    if (layout) {
        layout.classList.add('mobile-chat-active');
    }

    // Reset history tracking
    renderedMessageIds.clear();
    const messagesArea = document.getElementById('chat-messages-area');
    messagesArea.innerHTML = '';

    // Initial Load
    await loadChatHistory(chatId);
}

function backToChatList() {
    activeChatId = null;
    renderedMessageIds.clear();
    const layout = document.querySelector('.chats-layout');
    if (layout) {
        layout.classList.remove('mobile-chat-active');
    }
    // Highlighting reset
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}

async function loadChatHistory(chatId) {
    const messagesArea = document.getElementById('chat-messages-area');
    // loading spinner only if empty?
    if (messagesArea.children.length === 0) {
        messagesArea.innerHTML = '<div class="chat-loading">Cargando historial...</div>';
    }

    try {
        const messages = await adminFetch(`/admin/chats/${chatId}/messages`);

        // Only append new messages
        let hasNew = false;
        messages.forEach(msg => {
            if (!renderedMessageIds.has(msg.id)) {
                if (messagesArea.querySelector('.chat-loading')) messagesArea.innerHTML = '';
                renderMessageBubble(msg, messagesArea);
                renderedMessageIds.add(msg.id);
                hasNew = true;
            }
        });

        // Scroll to bottom if new messages added
        if (hasNew) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }

    } catch (err) {
        console.error("Error loading messages:", err);
    }
}

function renderMessageBubble(msg, container) {
    // If it's an assistant or human supervisor message, try to parse it as JSON
    if (msg.role === 'assistant' || msg.role === 'human_supervisor') {
        try {
            const rawContent = msg.content || '';
            const isJson = rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[');

            if (isJson) {
                const parsed = JSON.parse(rawContent);
                if (parsed.messages && Array.isArray(parsed.messages)) {
                    // Render each part as a separate bubble
                    parsed.messages.forEach(subMsg => {
                        const virtualMsg = {
                            ...msg,
                            content: subMsg.text || subMsg.content || '',
                            message_type: (subMsg.imageUrl || subMsg.image_url) ? 'image' : 'text',
                            storage_url: subMsg.imageUrl || subMsg.image_url || msg.storage_url
                        };
                        createBubbleElement(virtualMsg, container);
                    });
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to parse message JSON, showing as raw:", e);
        }
    }

    // Default: Single bubble
    createBubbleElement(msg, container);
}

function createBubbleElement(msg, container) {
    const div = document.createElement('div');
    const role = msg.role;
    const isUser = role === 'user';
    const isHuman = msg.human_override || role === 'human_supervisor';
    const isAssistant = role === 'assistant';

    // Alignment Classes from style.css
    // style.css uses: .message-bubble.user, .message-bubble.assistant, .message-bubble.human
    let bubbleClass = 'assistant';
    if (isUser) bubbleClass = 'user';
    if (isHuman) bubbleClass = 'human';

    div.className = `message-bubble ${bubbleClass}`;

    let contentHtml = '';
    const mediaUrl = msg.storage_url || msg.preview_url;

    if (msg.message_type === 'image') {
        const caption = msg.content || '';
        contentHtml = `<img src="${mediaUrl || '#'}" class="image-preview" loading="lazy" onclick="window.open('${mediaUrl}', '_blank')">`;
        if (caption) contentHtml += `<div class="caption">${caption}</div>`;
    } else if (msg.message_type === 'audio') {
        contentHtml = `<audio controls src="${mediaUrl || '#'}"></audio>`;
        if (msg.content) contentHtml += `<div class="transcription">🎤 ${msg.content}</div>`;
    } else if (msg.message_type === 'document') {
        contentHtml = `<div class="file-attachment">
            <span class="icon">📄</span> 
            <a href="${mediaUrl}" target="_blank">Ver Documento</a>
         </div>`;
        if (msg.content) contentHtml += `<div class="caption">${msg.content}</div>`;
    } else {
        // Text
        const text = (msg.content || '').replace(/\n/g, '<br>');
        contentHtml = `<p>${text}</p>`;
    }

    const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Meta Label / Icon
    let metaLabel = '';
    if (isHuman) metaLabel = 'Agente Humano';
    if (isAssistant) metaLabel = 'IA Assistant';
    if (isUser) metaLabel = '';

    div.innerHTML = `
        ${metaLabel ? `<div class="message-label">${metaLabel}</div>` : ''}
        <div class="bubble-content">
            ${contentHtml}
        </div>
        <span class="message-time">${timeStr}</span>
    `;

    container.appendChild(div);
}

async function toggleHumanOverride() {
    if (!activeChatId) return;

    const toggle = document.getElementById('human-override-toggle');
    const label = document.getElementById('human-override-label');
    const isEnabled = toggle.checked;

    // Optimistic UI update
    label.innerText = isEnabled ? "Atención Humana" : "Agente Activo";
    label.style.color = isEnabled ? "#ef4444" : "#22c55e"; // Red/Green

    try {
        const res = await adminFetch(`/admin/conversations/${activeChatId}/human-override`, 'POST', {
            enabled: isEnabled
        });

        if (res.status !== 'ok' && !res.human_override_enabled === isEnabled) throw new Error("API Error");

        // Update local state in allChats to prevent UI flicker on reload
        const chat = allChats.find(c => c.id === activeChatId);
        if (chat) {
            chat.is_locked = isEnabled;
            chat.status = isEnabled ? 'human_override' : 'active';
            chat.human_override_until = isEnabled ? '2099-01-01T00:00:00' : null;
        }
        showNotification(true, 'Estado Actualizado', isEnabled ? 'Atención Humana Activada' : 'Agente IA Reactivado');

    } catch (e) {
        console.error("Toggle override failed", e);
        showNotification(false, 'Error', 'No se pudo cambiar el estado.');
        // Revert UI
        toggle.checked = !isEnabled;
        label.innerText = !isEnabled ? "Atención Humana" : "Agente Activo";
        label.style.color = !isEnabled ? "#ef4444" : "#22c55e";
    }
}


async function sendManualMessage() {
    if (!activeChatId) return;
    const input = document.getElementById('chat-input-text');
    const text = input.value.trim();
    if (!text) return;

    const sendBtn = document.getElementById('chat-send-btn');
    const originalText = sendBtn.innerText;
    sendBtn.disabled = true;
    sendBtn.innerText = '⏳';

    try {
        await adminFetch('/admin/messages/send', 'POST', {
            conversation_id: activeChatId,
            text: text,
            human_override: true
        });
        input.value = '';

        // Refresh immediately
        await loadChatHistory(activeChatId);
        loadChats(); // Update sidebar preview

    } catch (err) {
        showNotification(false, 'Error', 'No se pudo enviar el mensaje: ' + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = originalText;
    }
}

function filterChats() {
    const query = document.getElementById('chat-search').value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(item => {
        const name = item.querySelector('.chat-name').innerText.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

// Background Polling
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        // Only poll if window is visible or active? (Simpler for now: always while in chats view)
        if (currentView === 'chats') {
            await loadChats();
            if (activeChatId) {
                await loadChatHistory(activeChatId);
            }
        }
    }, 4000); // 4 seconds
}

// Initialize
window.onload = () => {
    startPolling();
};
