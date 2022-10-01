import { app, BrowserWindow, Menu, MenuItem } from "electron";
import { connectSSH, startDiscovery, startManualDiscovery } from "./main";

// MENU
interface SubmenuItem {
	label?: string;
	click?: () => void; 
	type?: string;
	accelerator?: string | boolean;
	role?: string;
	submenu?: { role: string; }[];
}

interface MenuItemRebrand {
	label?: string;
	role?: string;
	submenu: SubmenuItem[];
}

export default function defineMenu(win: BrowserWindow) {
    const template: MenuItemRebrand[] = [
        {
          label: 'Product',
          submenu: [
            { 
                label: 'Discover Products Again',
                click () { 
                    startDiscovery(); 
                    startManualDiscovery(); 
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
                    connectSSH(); 
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
    };

    const menu = Menu.buildFromTemplate(template as unknown as MenuItem[]);
    Menu.setApplicationMenu(menu);
    
    return menu;
}

