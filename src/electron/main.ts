import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } from "electron"
import { execSync } from "child_process";
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import { handleClientEvent, sessions, cleanupAllSessions } from "./ipc-handlers.js";
import { generateSessionTitle } from "./libs/util.js";
import { saveApiConfig } from "./libs/config-store.js";
import { getCurrentApiConfig, getAvailableModels } from "./libs/claude-settings.js";
import type { ClientEvent } from "./types.js";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join, basename } from "path";
import { readdirSync, statSync } from "fs";
import "./libs/claude-settings.js";

let cleanupComplete = false;
let mainWindow: BrowserWindow | null = null;

function killViteDevServer(): void {
    if (!isDev()) return;
    try {
        if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${DEV_PORT}') do taskkill /PID %a /F`, { stdio: 'ignore', shell: 'cmd.exe' });
        } else {
            execSync(`lsof -ti:${DEV_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch {
        // Process may already be dead
    }
}

function cleanup(): void {
    if (cleanupComplete) return;
    cleanupComplete = true;

    globalShortcut.unregisterAll();
    stopPolling();
    cleanupAllSessions();
    killViteDevServer();
}

function handleSignal(): void {
    cleanup();
    app.quit();
}

// Initialize everything when app is ready
app.on("ready", () => {
    Menu.setApplicationMenu(null);
    // Setup event handlers
    app.on("before-quit", cleanup);
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        cleanup();
        app.quit();
    });

    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
    process.on("SIGHUP", handleSignal);

    // Create main window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
        },
        icon: getIconPath(),
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    if (isDev()) mainWindow.loadURL(`http://localhost:${DEV_PORT}`)
    else mainWindow.loadFile(getUIPath());

    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle client events
    ipcMain.on("client-event", (_: any, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_: any, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request
    ipcMainHandle("get-recent-cwds", (_: any, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        return sessions.listRecentCwds(boundedLimit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Handle API config
    ipcMainHandle("get-api-config", () => {
        return getCurrentApiConfig();
    });

    ipcMainHandle("check-api-config", () => {
        const config = getCurrentApiConfig();
        return { hasConfig: config !== null, config };
    });

    // Handle available models (merged: custom list + ~/.claude/settings.json + default)
    ipcMainHandle("get-available-models", () => {
        return { models: getAvailableModels() };
    });

    ipcMainHandle("save-api-config", (_: any, config: any) => {
        try {
            saveApiConfig(config);
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    });

    // Create a temporary random directory
    ipcMainHandle("create-temp-directory", async () => {
        try {
            const tempDir = await mkdtemp(join(tmpdir(), "cowork-"));
            return tempDir;
        } catch (error) {
            console.error("[main] Failed to create temp directory:", error);
            return null;
        }
    });

    // List subdirectories of a given path (for directory picker)
    ipcMainHandle("list-directories", async (_: any, parentPath: string | null) => {
        try {
            const searchRoot = parentPath || process.env.HOME || process.env.USERPROFILE || "/Users";
            const entries = readdirSync(searchRoot, { withFileTypes: true });
            const dirs = entries
                .filter((e) => e.isDirectory())
                .map((e) => ({
                    name: e.name,
                    path: join(searchRoot, e.name),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            return { root: searchRoot, directories: dirs };
        } catch (error) {
            console.error("[main] Failed to list directories:", error);
            return { root: "", directories: [] as Array<{ name: string; path: string }> };
        }
    });
})
