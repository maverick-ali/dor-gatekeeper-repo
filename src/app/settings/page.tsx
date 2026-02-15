"use client";

import { useState, useEffect, useCallback } from 'react';

interface Settings {
  id: string;
  mockMode: boolean;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKeys: string;
  jiraJql: string;
  slackBotToken: string;
  slackSigningSecret: string;
  slackAppToken: string;
  slackDefaultChannel: string;
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
}

interface UserMapping {
  id: string;
  jiraEmail: string;
  slackUserId: string;
  slackDisplayName: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // User mapping state
  const [mappings, setMappings] = useState<UserMapping[]>([]);
  const [newMapping, setNewMapping] = useState({ jiraEmail: '', slackUserId: '', slackDisplayName: '' });
  const [mappingMessage, setMappingMessage] = useState('');

  const fetchMappings = useCallback(async () => {
    try {
      const response = await fetch('/api/mappings');
      if (response.ok) {
        const data = await response.json();
        setMappings(data);
      }
    } catch (error) {
      console.error('Error fetching mappings:', error);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchMappings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultSettings: Settings = {
    id: '',
    mockMode: true,
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraProjectKeys: '',
    jiraJql: '',
    slackBotToken: '',
    slackSigningSecret: '',
    slackAppToken: '',
    slackDefaultChannel: '',
    llmProvider: 'ollama',
    llmApiKey: '',
    llmModel: 'llama3.2',
    llmBaseUrl: '',
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (response.ok) {
        setSettings(data);
      } else {
        // No settings in DB yet — use defaults so the form is usable
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setSettings(defaultSettings);
      setMessage('Error loading settings — using defaults');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();
      setMessage(data.message || 'Settings saved successfully');
    } catch (error) {
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const modelsByProvider: Record<string, { value: string; label: string }[]> = {
    ollama: [
      { value: 'llama3.2', label: 'Llama 3.2 (Free, Local)' },
      { value: 'llama3.1', label: 'Llama 3.1 (Free, Local)' },
      { value: 'mistral', label: 'Mistral (Free, Local)' },
      { value: 'codellama', label: 'Code Llama (Free, Local)' },
      { value: 'gemma2', label: 'Gemma 2 (Free, Local)' },
    ],
    groq: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Free Tier)' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Free Tier)' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Free Tier)' },
      { value: 'gemma2-9b-it', label: 'Gemma 2 9B (Free Tier)' },
    ],
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    anthropic: [
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    ],
    lmstudio: [
      { value: 'default', label: 'Default Model (Local)' },
    ],
    custom: [
      { value: 'custom', label: 'Custom Model' },
    ],
  };

  const providerBaseUrls: Record<string, string> = {
    ollama: 'http://localhost:11434/v1',
    groq: 'https://api.groq.com/openai/v1',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    lmstudio: 'http://localhost:1234/v1',
    custom: '',
  };

  const handleChange = (field: keyof Settings, value: any) => {
    if (settings) {
      if (field === 'llmProvider') {
        // Auto-select first model and base URL for the new provider
        const models = modelsByProvider[value] || [];
        const baseUrl = providerBaseUrls[value] || '';
        setSettings({
          ...settings,
          llmProvider: value,
          llmModel: models[0]?.value || '',
          llmBaseUrl: baseUrl,
        });
      } else {
        setSettings({ ...settings, [field]: value });
      }
    }
  };

  const addMapping = async () => {
    if (!newMapping.jiraEmail || !newMapping.slackUserId) {
      setMappingMessage('JIRA email and Slack User ID are required');
      return;
    }
    try {
      const response = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping),
      });
      if (response.ok) {
        setNewMapping({ jiraEmail: '', slackUserId: '', slackDisplayName: '' });
        setMappingMessage('Mapping saved');
        fetchMappings();
      } else {
        const data = await response.json();
        setMappingMessage(data.error || 'Failed to save mapping');
      }
    } catch {
      setMappingMessage('Error saving mapping');
    }
  };

  const deleteMapping = async (id: string) => {
    try {
      const response = await fetch(`/api/mappings?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        setMappingMessage('Mapping deleted');
        fetchMappings();
      }
    } catch {
      setMappingMessage('Error deleting mapping');
    }
  };

  const isMock = settings?.mockMode ?? true;

  if (loading) {
    return <div className="py-10 text-center">Loading...</div>;
  }

  if (!settings) {
    return <div className="py-10 text-center">No settings found</div>;
  }

  return (
    <div className="py-10">
      <header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold leading-tight text-gray-900">Settings</h1>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-8 sm:px-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    General Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        id="mockMode"
                        type="checkbox"
                        checked={settings.mockMode}
                        onChange={(e) => handleChange('mockMode', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="mockMode" className="ml-2 block text-sm text-gray-900">
                        Enable Mock Mode (for demo without live integrations)
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <fieldset disabled={isMock} className={`space-y-6 ${isMock ? 'opacity-50' : ''}`}>
              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-1">
                    Jira Configuration
                  </h3>
                  {isMock && (
                    <p className="text-xs text-amber-600 mb-4">Disabled in Mock Mode</p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Base URL</label>
                      <input
                        type="text"
                        value={settings.jiraBaseUrl}
                        onChange={(e) => handleChange('jiraBaseUrl', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="https://example.atlassian.net"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <input
                        type="email"
                        value={settings.jiraEmail}
                        onChange={(e) => handleChange('jiraEmail', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">API Token</label>
                      <input
                        type="password"
                        value={settings.jiraApiToken}
                        onChange={(e) => handleChange('jiraApiToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Project Keys (comma-separated)</label>
                      <input
                        type="text"
                        value={settings.jiraProjectKeys}
                        onChange={(e) => handleChange('jiraProjectKeys', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="DEMO, PROD"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">JQL Query</label>
                      <textarea
                        value={settings.jiraJql}
                        onChange={(e) => handleChange('jiraJql', e.target.value)}
                        rows={3}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="project = DEMO AND type = Story"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-1">
                    Slack Configuration
                  </h3>
                  {isMock && (
                    <p className="text-xs text-amber-600 mb-4">Disabled in Mock Mode</p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bot Token</label>
                      <input
                        type="password"
                        disabled={isMock}
                        value={settings.slackBotToken}
                        onChange={(e) => handleChange('slackBotToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="xoxb-..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Signing Secret</label>
                      <input
                        type="password"
                        disabled={isMock}
                        value={settings.slackSigningSecret}
                        onChange={(e) => handleChange('slackSigningSecret', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">App Token (for Socket Mode)</label>
                      <input
                        type="password"
                        disabled={isMock}
                        value={settings.slackAppToken}
                        onChange={(e) => handleChange('slackAppToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="xapp-..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Default Channel</label>
                      <input
                        type="text"
                        disabled={isMock}
                        value={settings.slackDefaultChannel}
                        onChange={(e) => handleChange('slackDefaultChannel', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="#general"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-1">
                    LLM Configuration
                  </h3>
                  {isMock && (
                    <p className="text-xs text-amber-600 mb-4">Disabled in Mock Mode</p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Provider</label>
                      <select
                        disabled={isMock}
                        value={settings.llmProvider}
                        onChange={(e) => handleChange('llmProvider', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <option value="ollama">Ollama (Free, Local)</option>
                        <option value="groq">Groq (Free Tier)</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="lmstudio">LM Studio (Free, Local)</option>
                        <option value="custom">Custom (OpenAI-compatible)</option>
                      </select>
                      {(settings.llmProvider === 'ollama' || settings.llmProvider === 'lmstudio') && (
                        <p className="mt-1 text-xs text-green-600">
                          Free &amp; local — no API key needed. Ensure the server is running.
                        </p>
                      )}
                      {settings.llmProvider === 'groq' && (
                        <p className="mt-1 text-xs text-green-600">
                          Free tier available at groq.com — sign up for a free API key.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        API Key
                        {(settings.llmProvider === 'ollama' || settings.llmProvider === 'lmstudio') && (
                          <span className="text-xs text-gray-400 ml-1">(not required for local providers)</span>
                        )}
                      </label>
                      <input
                        type="password"
                        disabled={isMock}
                        value={settings.llmApiKey}
                        onChange={(e) => handleChange('llmApiKey', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder={settings.llmProvider === 'ollama' ? 'Not required' : 'sk-...'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Model</label>
                      <select
                        disabled={isMock}
                        value={settings.llmModel}
                        onChange={(e) => handleChange('llmModel', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {(modelsByProvider[settings.llmProvider] || []).map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Base URL
                        <span className="text-xs text-gray-400 ml-1">(auto-set based on provider)</span>
                      </label>
                      <input
                        type="text"
                        disabled={isMock}
                        value={settings.llmBaseUrl}
                        onChange={(e) => handleChange('llmBaseUrl', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                  </div>
                </div>
              </div>
              </fieldset>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

              {message && (
                <div className="rounded-md bg-green-50 p-4">
                  <p className="text-sm text-green-800">{message}</p>
                </div>
              )}
            </form>

            {/* User Mapping Section (always visible, outside the form) */}
            <div className="mt-8 bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-1">
                  User Mappings (JIRA → Slack)
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Map JIRA email addresses to Slack user IDs. If your JIRA and Slack emails match, auto-lookup works and no manual mapping is needed.
                </p>

                {/* Existing mappings */}
                {mappings.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">JIRA Email</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Slack User ID</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Display Name</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {mappings.map((m) => (
                          <tr key={m.id}>
                            <td className="px-3 py-2 text-gray-900">{m.jiraEmail}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono text-xs">{m.slackUserId}</td>
                            <td className="px-3 py-2 text-gray-600">{m.slackDisplayName || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => deleteMapping(m.id)}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add new mapping */}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">JIRA Email</label>
                    <input
                      type="email"
                      value={newMapping.jiraEmail}
                      onChange={(e) => setNewMapping({ ...newMapping, jiraEmail: e.target.value })}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="you@company.com"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Slack User ID</label>
                    <input
                      type="text"
                      value={newMapping.slackUserId}
                      onChange={(e) => setNewMapping({ ...newMapping, slackUserId: e.target.value })}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="U0XXXXXXXX"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Display Name (optional)</label>
                    <input
                      type="text"
                      value={newMapping.slackDisplayName}
                      onChange={(e) => setNewMapping({ ...newMapping, slackDisplayName: e.target.value })}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Your Name"
                    />
                  </div>
                  <button
                    onClick={addMapping}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Add Mapping
                  </button>
                </div>

                {mappingMessage && (
                  <p className={`mt-2 text-sm ${mappingMessage.includes('Error') || mappingMessage.includes('required') ? 'text-red-600' : 'text-green-600'}`}>
                    {mappingMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
