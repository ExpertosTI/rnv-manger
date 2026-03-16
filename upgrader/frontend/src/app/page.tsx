"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileType, CheckCircle, Play, Server, RefreshCw, Download } from "lucide-react";
import Login from "./login";
import TerminalUI from "./terminal";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceVersion, setSourceVersion] = useState("16.0");
  const [targetVersion, setTargetVersion] = useState("18.0");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMigrationComplete, setIsMigrationComplete] = useState(false);
  const [isMigrationSuccess, setIsMigrationSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files[0].name.endsWith(".zip")) {
        setFile(e.dataTransfer.files[0]);
      } else {
        alert("Please upload a .zip file");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const getApiBase = () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/upgrader-service";
    const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;
    const envApi = process.env.NEXT_PUBLIC_API_URL;
    if (envApi && envApi.length > 0) {
      return envApi.replace(/\/$/, "");
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${normalizedBasePath}`;
    }
    return normalizedBasePath;
  };

  const handleUploadAndMigrate = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Upload File
      const formData = new FormData();
      formData.append("file", file);

      const apiBase = getApiBase();
      const uploadRes = await fetch(`${apiBase}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const { session_id } = await uploadRes.json();

      // 2. Trigger Migration
      const migrateUrl = new URL(`${apiBase}/api/sessions/${session_id}/migrate`);
      migrateUrl.searchParams.append("source_version", sourceVersion);
      migrateUrl.searchParams.append("target_version", targetVersion);

      const migrateRes = await fetch(migrateUrl.toString(), { method: "POST" });
      if (!migrateRes.ok) throw new Error("Trigger migration failed");

      // 3. Mount Terminal (which connects to WS automatically)
      setSessionId(session_id);

    } catch (e) {
      console.error(e);
      alert("Error starting migration pipeline");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = () => {
    if (!sessionId) return;
    const apiBase = getApiBase();

    // Open the download URL directly — the browser will handle the file download
    const downloadUrl = `${apiBase}/api/sessions/${sessionId}/download`;
    window.open(downloadUrl, "_blank");
  };

  const onMigrationEnd = (success: boolean) => {
    setIsMigrationComplete(true);
    setIsMigrationSuccess(success);

    // Descarga automática al detectar éxito
    if (success) {
      setTimeout(() => {
        handleDownload();
      }, 1000); // Pequeño retraso para que el usuario vea el mensaje de éxito
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <header className="px-8 py-6 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-500" />
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            upgradernc
          </h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 max-w-5xl mx-auto w-full gap-8">

        {/* State 1: Selection & Input mode */}
        {!sessionId && (
          <>
            <div className="text-center space-y-4 mb-2">
              <h2 className="text-5xl font-extrabold tracking-tight">
                Migrate Odoo Databases <span className="text-emerald-500">Automatically</span>
              </h2>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto leading-relaxed">
                Upload your Odoo 16/17 `.zip` backup and let OpenUpgrade handle the rest.
                Fully isolated migrations powered by Docker.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-6">

              {/* Version Selection Card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -z-10 group-hover:bg-indigo-500/10 transition"></div>

                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-400" /> Version Control
                </h3>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Current Version</label>
                    <select
                      value={sourceVersion}
                      onChange={(e) => setSourceVersion(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow transition"
                    >
                      <option value="16.0">Odoo 16.0</option>
                      <option value="17.0">Odoo 17.0</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Target Version</label>
                    <select
                      value={targetVersion}
                      onChange={(e) => setTargetVersion(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow transition"
                    >
                      <option value="17.0">Odoo 17.0</option>
                      <option value="18.0">Odoo 18.0</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Upload Card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl flex flex-col justify-between">
                {!file ? (
                  <div
                    className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition-colors duration-200 ease-in-out cursor-pointer hover:bg-neutral-800/50 ${isDragging ? "border-indigo-500 bg-indigo-500/10" : "border-neutral-700"} `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    <UploadCloud className={`w-14 h-14 mb-4 ${isDragging ? "text-indigo-400" : "text-neutral-500"}`} />
                    <p className="text-lg font-medium text-neutral-300">Drag & Drop your backup</p>
                    <p className="text-sm text-neutral-500 mt-2">Only .zip files supported</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-solid border-neutral-800 rounded-2xl bg-neutral-950/50 p-6 relative">
                    <button
                      onClick={() => setFile(null)}
                      className="absolute top-4 right-4 text-neutral-500 hover:text-white transition"
                    >
                      ×
                    </button>
                    <FileType className="w-16 h-16 text-indigo-400 mb-4" />
                    <p className="text-lg font-medium text-white truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-neutral-500 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>

                    <div className="flex items-center gap-2 mt-4 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full text-sm font-medium">
                      <CheckCircle className="w-4 h-4" /> Ready to migrate
                    </div>
                  </div>
                )}

                <button
                  disabled={!file || isUploading}
                  onClick={handleUploadAndMigrate}
                  className={`mt-6 w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 ${!file || isUploading ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/25"}`}
                >
                  {isUploading ? (
                    <><RefreshCw className="w-5 h-5 animate-spin" /> Uploading & Initializing...</>
                  ) : (
                    <><Play className="w-5 h-5" /> Start Migration Pipeline</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* State 2: Progress Mode (Terminal) */}
        {sessionId && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-6 mt-12">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold">Migration in Progress</h2>
                <p className="text-neutral-400 mt-1">Streaming live logs from OpenUpgrade orchestrator...</p>
              </div>
              {isMigrationComplete && isMigrationSuccess && (
                <button
                  onClick={handleDownload}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all">
                  <Download className="w-5 h-5" /> Download Migrated DB (v{targetVersion})
                </button>
              )}
            </div>

            <TerminalUI sessionId={sessionId} onComplete={onMigrationEnd} />
          </div>
        )}
      </main>
    </div>
  );
}
