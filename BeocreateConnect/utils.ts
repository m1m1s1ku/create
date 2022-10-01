import { app, BrowserWindow, Menu, MenuItem, nativeTheme, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { browser, connectSSH, currentRouting, manuallyDiscoveredProduct, products, Service, sshInstance, startDiscovery, startManualDiscovery, stopDiscovery, stopManualDiscovery, win } from "./main";
import { networkInterfaces } from "os";

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

let ipCheckInterval: NodeJS.Timer | null = null;
function startCheckingIPAddress(): void {
	hasIPChanged();
	ipCheckInterval = setInterval(function() {
        if (hasIPChanged()) {
            startDiscovery();
            startManualDiscovery();
        }
	}, 10000);
}

let oldIPs: string[] = [];
function hasIPChanged(): boolean {
	let ifaces = networkInterfaces();
	let newIPs = []
	for (let iface in ifaces) {
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
				startDiscovery();
				startCheckingIPAddress();
				startManualDiscovery();
			}, 500);
		}, 100);
    });
    
    win.on('closed', () => {
	  stopManualDiscovery();

	  if(ipCheckInterval) {
		clearInterval(ipCheckInterval);
	  }

	  stopDiscovery();
	  if(sshInstance) {
		sshInstance.dispose();
	  }
    });
    
    win.on('focus', () => {
    	win?.webContents.send('windowEvent', "activate");
		refreshProducts(null);
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

export function refreshProducts(services?: Service[] | null): void {
	if (services == null) {
		services = [];
		if (browser) {
			services = browser.list();
		}
	}

	if (services.length == 0 && manuallyDiscoveredProduct) {
		services.push(manuallyDiscoveredProduct);
	}

	if (services) {
		// Find out which services have been added.
		for (let s = 0; s < services.length; s++) {
			if (!products[services[s].fullname]) {
				setProductInfo(services[s]); // Adds product.
				//console.log(products[services[s].fullname].addresses);
				win?.webContents.send('addProduct', products[services[s].fullname]);
			}
		}
		
		// Find out which services have been removed.
		for (let fullname in products) {
			let serviceFound = -1;
			for (let s = 0; s < services.length; s++) {
				if (services[s].fullname == fullname) serviceFound = s;
			}
			if (serviceFound == -1) {
				win?.webContents.send('removeProduct', products[fullname]);
				delete products[fullname]; // Removes product.
			}
		}
	}
}

export interface Product {
	fullname: string | number;
	addresses: string[];
	host: string;
	port: string;
	name: string;
	modelID: string | null;
	modelName: string | null;
	productImage: string | null;
	systemID: string | null;
	systemStatus: string | null;
	boundTo: string | undefined;
	manual: boolean;
	txt: Record<string, string>;
}

export function setProductInfo(service: Service): Product {
	let modelID = null;
	let modelName = null;
	let systemID = null;
	let systemStatus = null;
	let productImage = null;

	for (const key in service.txt) {
		if(!service.txt.hasOwnProperty(key)) {
			continue;
		}

		switch (key) {
			case "type":
			case "device_type":
				modelID = service.txt[key];
				break;
			case "typeui":
				modelName = service.txt[key];
				break;
			case "id":
			case "device_id":
				systemID = service.txt[key];
				break;
			case "status":
			case "device_status":
				systemStatus = service.txt[key];
				break;
			case "image":
				productImage = service.txt[key];
				break;
		}
	}

	let product: Product = {
		fullname: service.fullname,
		addresses: service.addresses,
		host: service.host,
		port: service.port,
		name: service.name,
		modelID: modelID,
		modelName: modelName,
		productImage: productImage,
		systemID: systemID,
		systemStatus: systemStatus,
		boundTo: undefined,
		manual: false,
		txt: {}
	};

	// @note : auto-magic bind (jack button => reflect by bolt on UI)
	if(currentRouting && currentRouting.from === service.name) {
		product.boundTo = currentRouting.to;
	} else if(currentRouting && currentRouting.to === service.name) {
		product.boundTo = currentRouting.from;
	}

	if (service.manual) {
		product.manual = true;
	} 
	products[service.fullname] = product;
	return product;
}
