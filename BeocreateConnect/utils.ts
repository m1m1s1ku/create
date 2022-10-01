/*
Copyright 2018-2022 Bang & Olufsen A/S

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


import { app, BrowserWindow, Menu, MenuItem, nativeTheme, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { networkInterfaces } from "os";

import { 
    bindBerries,
    closeSSHClient,
} from "./main";
import { MenuItemRebrand } from "./beocreate-connect";
import { 
  refreshProducts, 
  startDiscovery,
  startManualDiscovery, 
  stopDiscovery, 
  stopManualDiscovery
} from "./network";

let ipCheckInterval: NodeJS.Timer | null = null;
function startCheckingIPAddress(win: BrowserWindow | null): void {
	hasIPChanged();
	ipCheckInterval = setInterval(function() {
        if (hasIPChanged()) {
            startDiscovery(win);
            startManualDiscovery(win);
        }
	}, 10000);
}

let oldIPs: string[] = [];
function hasIPChanged(): boolean {
	const ifaces = networkInterfaces();
	const newIPs = [];
	for (const iface in ifaces) {
		const currentInterface = ifaces[iface];
		if(!currentInterface) { continue; }

		for (let i = 0; i < currentInterface.length ?? 0; i++) {
			if (currentInterface[i].family == "IPv4") {
				newIPs.push(currentInterface[i].address);
			}
		}
	}
	if (equals(oldIPs, newIPs)) {
		return false;
	} else {
		oldIPs = newIPs;
		return true;
	}
}

function equals(arrA: (unknown|unknown[])[], arrB: (unknown | unknown[])[]): boolean {
    if (!arrA){
      return false;
    }

    if (arrA.length != arrB?.length) {
      return false;
    }

    for (let i = 0, l=arrA.length; i < l; i++) {
      const item = arrA[i];
      const itemB = arrB[i];

      if(item instanceof Array &&  itemB instanceof Array) {
        if(!equals(item, itemB)) {
          return false;
        }
      } else if (item != itemB) {
        return false;
      }
    }

    return true;
}

export function createWindow(): BrowserWindow {
	const mainWindowState = windowStateKeeper({
      defaultWidth: 820,
      defaultHeight: 600
	});

	const win = new BrowserWindow({
		x: mainWindowState.x,
		y: mainWindowState.y,
		width: mainWindowState.width,
		height: mainWindowState.height, 
		minWidth: 450, 
		minHeight: 300, 
		titleBarStyle: "hiddenInset", 
		title: "Beocreate Connect",
		frame: false,
		show: false,
		backgroundColor: '#FFFFFF', 
		webPreferences: { experimentalFeatures: false, nodeIntegration: true, contextIsolation: false,}
	});

	defineMenu(win);
	
	mainWindowState.manage(win);
  
	// @todo : use build/index.html for release bundling.
	// demistify that
  //win.loadFile('build/index.html')
  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    if (process.platform == 'darwin') {
      win?.webContents.send('colourSchemeIsDark', nativeTheme.shouldUseDarkColors);
    }
    win?.webContents.send('styleForWindows', process.platform !== 'darwin');
    setTimeout(function() {
      win?.show();
      setTimeout(function() {
        startDiscovery(win);
        startCheckingIPAddress(win);
        startManualDiscovery(win);
      }, 500);
    }, 100);
  });
  
  win.on('closed', () => {
    stopManualDiscovery();

    if(ipCheckInterval) {
      clearInterval(ipCheckInterval);
    }

    stopDiscovery();
    closeSSHClient();
  });
  
  win.on('focus', () => {
    win?.webContents.send('windowEvent', "activate");
    refreshProducts(win, null);
  });
  
  win.on('blur', () => {
    win?.webContents.send('windowEvent', "resignActive");
  });

  win.on("enter-full-screen", () => {
    win?.webContents.send('windowEvent', "fullScreen");
  });

  win.on("leave-full-screen", () => {
    win?.webContents.send('windowEvent', "windowed");
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);

    return { action: "allow" };
  });

	return win;
}

export default function defineMenu(win: BrowserWindow) {
    const template: MenuItemRebrand[] = [
        {
          label: 'Product',
          submenu: [
            { 
                label: 'Discover Products Again',
                click () { 
                    startDiscovery(win); 
                    startManualDiscovery(win); 
                }
            },
            { 
                type: 'separator' 
            },
            { 
                label: 'Reload Product View',
                click () { 
                    win?.webContents.send('reloadProductView');
                }, 
                accelerator: "CmdOrCtrl+R"
            },
            { 
                type: 'separator'
            },
            { 
                label: 'Bind Aux to Amp',
                click () { 
                    bindBerries(); 
                }
            },
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'pasteandmatchstyle' },
            { role: 'delete' },
            { role: 'selectall' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'resetzoom' },
            { role: 'zoomin' },
            { role: 'zoomout' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Develop',
          submenu: [
            { role: 'reload', accelerator: false },
            { role: 'forcereload', accelerator: false },
            { role: 'toggledevtools' }
          ]
        },
        {
          role: 'window',
          submenu: [
            { role: 'minimize' },
            { role: 'close' }
          ]
        }
      ]
      
      if (process.platform === 'darwin') {
        template.unshift({
          label: app.getName(),
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        })
      
        // Edit menu
        template[2].submenu.push(
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startspeaking' },
              { role: 'stopspeaking' }
            ]
          }
        )
      
        // Window menu
        template[5].submenu = [
          { role: 'close' },
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
    }

    const menu = Menu.buildFromTemplate(template as unknown as MenuItem[]);
    Menu.setApplicationMenu(menu);
    
    return menu;
}