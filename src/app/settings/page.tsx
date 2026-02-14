"use client";

import { useState, useEffect } from 'react';

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
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage('Error loading settings');
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

  const handleChange = (field: keyof Settings, value: any) => {
    if (settings) {
      setSettings({ ...settings, [field]: value });
    }
  };

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

              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Jira Configuration
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Base URL</label>
                      <input
                        type="text"
                        value={settings.jiraBaseUrl}
                        onChange={(e) => handleChange('jiraBaseUrl', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="https://example.atlassian.net"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <input
                        type="email"
                        value={settings.jiraEmail}
                        onChange={(e) => handleChange('jiraEmail', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">API Token</label>
                      <input
                        type="password"
                        value={settings.jiraApiToken}
                        onChange={(e) => handleChange('jiraApiToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Project Keys (comma-separated)</label>
                      <input
                        type="text"
                        value={settings.jiraProjectKeys}
                        onChange={(e) => handleChange('jiraProjectKeys', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="DEMO, PROD"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">JQL Query</label>
                      <textarea
                        value={settings.jiraJql}
                        onChange={(e) => handleChange('jiraJql', e.target.value)}
                        rows={3}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="project = DEMO AND type = Story"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Slack Configuration
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bot Token</label>
                      <input
                        type="password"
                        value={settings.slackBotToken}
                        onChange={(e) => handleChange('slackBotToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="xoxb-..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Signing Secret</label>
                      <input
                        type="password"
                        value={settings.slackSigningSecret}
                        onChange={(e) => handleChange('slackSigningSecret', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">App Token (for Socket Mode)</label>
                      <input
                        type="password"
                        value={settings.slackAppToken}
                        onChange={(e) => handleChange('slackAppToken', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="xapp-..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Default Channel</label>
                      <input
                        type="text"
                        value={settings.slackDefaultChannel}
                        onChange={(e) => handleChange('slackDefaultChannel', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="#general"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    LLM Configuration
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Provider</label>
                      <select
                        value={settings.llmProvider}
                        onChange={(e) => handleChange('llmProvider', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">API Key</label>
                      <input
                        type="password"
                        value={settings.llmApiKey}
                        onChange={(e) => handleChange('llmApiKey', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Model</label>
                      <input
                        type="text"
                        value={settings.llmModel}
                        onChange={(e) => handleChange('llmModel', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                  </div>
                </div>
              </div>

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
          </div>
        </div>
      </main>
    </div>
  );
}
