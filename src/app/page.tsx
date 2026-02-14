"use client";

import { useState, useEffect } from 'react';

interface ScannedIssue {
  id: string;
  jiraKey: string;
  summary: string;
  assignee: string;
  readinessScore: number;
  status: string;
  missingItems: string;
  scannedAt: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<ScannedIssue[]>([]);
  const [scanning, setScanning] = useState(false);

  const loadDemoData = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/seed', { method: 'POST' });
      const data = await response.json();
      setMessage(data.message || 'Demo data loaded!');
    } catch (error) {
      setMessage('Error loading demo data');
    } finally {
      setLoading(false);
    }
  };

  const scanIssues = async () => {
    setScanning(true);
    setMessage('');
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: 'DEMO' }),
      });
      const data = await response.json();
      setMessage(data.message || 'Scan completed!');
      fetchIssues();
    } catch (error) {
      setMessage('Error scanning issues');
    } finally {
      setScanning(false);
    }
  };

  const fetchIssues = async () => {
    try {
      const response = await fetch('/api/issues');
      const data = await response.json();
      setIssues(data);
    } catch (error) {
      console.error('Error fetching issues:', error);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-600 bg-green-100';
    if (score >= 2.5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      READY: 'bg-green-100 text-green-800',
      NEEDS_CLARIFICATION: 'bg-yellow-100 text-yellow-800',
      NEEDS_INFO: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="py-10">
      <header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold leading-tight text-gray-900">Dashboard</h1>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-8 sm:px-0">
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Welcome to DoR Gatekeeper
                </h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                  <p>
                    DoR Gatekeeper helps teams ensure story readiness before sprint planning by automatically
                    scanning Jira backlogs and orchestrating async Q&A loops via Slack.
                  </p>
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={loadDemoData}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                  >
                    {loading ? 'Loading...' : 'Load Demo Data'}
                  </button>
                  <button
                    onClick={scanIssues}
                    disabled={scanning}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
                  >
                    {scanning ? 'Scanning...' : 'Scan Issues'}
                  </button>
                </div>
                {message && (
                  <p className="mt-3 text-sm text-green-600">{message}</p>
                )}
              </div>
            </div>

            {issues.length > 0 && (
              <div className="mt-8 bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Scanned Issues
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Issue
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Summary
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Assignee
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Score
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map((issue) => (
                          <tr key={issue.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {issue.jiraKey}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {issue.summary}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {issue.assignee || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getScoreColor(issue.readinessScore)}`}>
                                {issue.readinessScore.toFixed(1)} / 5.0
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(issue.status)}`}>
                                {issue.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
