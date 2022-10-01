/*
Copyright 2018-2020 Bang & Olufsen A/S

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

// BEOCREATE CONNECT
import { app, Menu, BrowserWindow, ipcMain, nativeTheme, systemPreferences, shell, MenuItem } from 'electron';

import windowStateKeeper from 'electron-window-state';

import { Browser, tcp } from "dnssd2";
import { networkInterfaces } from "os";

import { NodeSSH } from 'node-ssh';
import { fetch } from 'cross-fetch';
import { ClientChannel } from 'ssh2';

let debug = false;
let activeWindow: boolean | null = true;

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

const template: MenuItemRebrand[] = [
  {
    label: 'Product',
    submenu: [
      { label: 'Discover Products Again',
      click () { startDiscovery(); startManualDiscovery(); }},
	  { type: 'separator' },
	  { label: 'Reload Product View',
	  click () { win?.webContents.send('reloadProductView') }, accelerator: "CmdOrCtrl+R"},
	  { type: 'separator'},
      { label: 'Bind Aux to Amp',
      click () { connectSSH(); }},
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

let win: BrowserWindow | null = null;
  
function createWindow () {
	const mainWindowState = windowStateKeeper({
	    defaultWidth: 820,
	    defaultHeight: 600
	});

	win = new BrowserWindow({
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
	
	mainWindowState.manage(win);
  
	// @todo : use build/index.html for release bundling.
	// demistify that
    //win.loadFile('build/index.html')
    win.loadFile('index.html');

	// win.webContents.openDevTools()

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
	  win = null;
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
		activeWindow = true;
    });
    
    win.on('blur', () => {
    	win?.webContents.send('windowEvent', "resignActive");
		activeWindow = null;
    });
	
	win.on("enter-full-screen", () => {
		win?.webContents.send('windowEvent', "fullScreen");
	});
	
	win.on("leave-full-screen", () => {
		win?.webContents.send('windowEvent', "windowed");
	});
	
	win.webContents.on('new-window', function(event, url){
	  event.preventDefault();
	  shell.openExternal(url);
	});
}
  
app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
});

// DARK / LIGHT MODE
if (process.platform == "darwin" && win) {
	systemPreferences.subscribeNotification(
	  'AppleInterfaceThemeChangedNotification',
	  function theThemeHasChanged () {
		win?.webContents.send('colourSchemeIsDark', nativeTheme.shouldUseDarkColors);
	  }
	)
}

interface Service {
	host: string;
	port: string;
	name: string;
	manual: boolean;
	fullname: string | number; 
	addresses: string[]; 
	txt: Record<string, string>;
}
  
// FIND BEOCREATE SYSTEMS
let browser: {
	on: (eventName: string, callback: (service: Service) => void) => void;
	start: () => void;
	stop: () => void;
	list: () => Service[];
} | null = null;
let startedOnce = false;
function startDiscovery(once?: boolean) { // Start or restart discovery.
	if (!once || !startedOnce) {
	  	if (!browser) {
		  	browser = new Browser(tcp('beocreate'), {maintain: true});
	
	  		browser?.on('serviceUp', service => discoveryEvent("up", service));
	  		browser?.on('serviceDown', service => discoveryEvent("down", service));
	  		browser?.on('serviceChanged', service => discoveryEvent("changed", service));
	  		browser?.on('error', error => console.log("dnssd error: "+error));
	  	} else {
	  		stopDiscovery();
	  	}

	  	console.log("Starting discovery.");
		browser?.start();
		bonjourProductCount = 0;
		startedOnce = true;
  }
}

function stopDiscovery() {
	if(!browser) { return; }

	browser.stop();
	products = {};
	bonjourProductCount = 0;

	console.log("Stopping discovery.");

	if (win) {
		win.webContents.send('discoveredProducts', products);
	}
}

let products: Record<string, Service> = {};
let bonjourProductCount = 0;

function discoveryEvent(event: string, service: Service): void {
	if (debug) {
		console.log(event, new Date(Date.now()).toLocaleString(), service.fullname, service.addresses, service.txt);
	}
	
	if (event == "up" || event == "down") {
		const list = browser?.list() ?? [];

		if (list) {
			refreshProducts(list);
		}

		bonjourProductCount = list ? list.length : 0;
	}
	
	if (event == "changed") {
		if (products[service.fullname]) {
			setProductInfo(service);
			win?.webContents.send('updateProduct', products[service.fullname]);
		}
	}
	
}

function refreshProducts(services?: Service[] | null): void {
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

interface Product {
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

function setProductInfo(service: Service): Product {
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

ipcMain.on("getAllProducts", (event, arg) => {
	win?.webContents.send('discoveredProducts', products);
});

ipcMain.on("refreshProducts", (event, arg) => {
	startDiscovery(); 
	startManualDiscovery();
});

function findProduct(name: string) {
	const productKey = Object.keys(products).find(key => {
		const product = products[key];
		if(product.name === name) {
			return key;
		}

		return null;
	});

	return productKey && products[productKey] ? products[productKey] : null;
}

let clientChannel: ClientChannel | null = null;
let sshInstance: NodeSSH | null = null;
let currentRouting: {
	from: string;
	to: string;
} | null = null;
async function connectSSH() {
	function cleanup () {
		sshInstance?.dispose();
		clientChannel?.close();
		clientChannel = null;
		sshInstance = null;
		currentRouting = null;
	}

	if(sshInstance) {
		cleanup();
		return;
	}

	sshInstance = new NodeSSH();

	currentRouting = {
		from: 'AuxBerry',
		to: 'HiFiBerry',
	};

	const source = findProduct(currentRouting.from);
	const destination = findProduct(currentRouting.to);

	const bitrate = "-f S24_LE";
	const codec = "-t wav";
	const samplingRate = "-r 60000";
	const channels = "-c2"

	const audioParams = `${bitrate} ${codec} ${samplingRate} ${channels}`;

	const sourceLocalIP = source?.addresses[0] ?? null;
	
	if(!sourceLocalIP) {
		console.error('Can\'t find source HifiBerry');
		return;
	}

	const destinationLocalIP = destination?.addresses[0] ?? null;

	if(!destinationLocalIP) {
		console.error('Can\'t find destination HifiBerry');
		return;
	}

	// @todo : Add settings to create this command dynamically.
	const username = 'root';
	const password = 'hifiberry';
	const sshKeyFileName = 'rcaberry';
	const lockFileName = 'connected.lock';

	const linkCommand = `arecord -D plughw:0,0 ${audioParams} | ssh -C ${username}@${destinationLocalIP} -i ${sshKeyFileName} aplay ${audioParams}`;
	const killCommand = `killall arecord | rm ${lockFileName}`;
	const lockCommand = `touch ${lockFileName} | echo ${destination?.name} > ${lockFileName}`;
	const isLockedCommand = `cat ${lockFileName}`;

	await sshInstance.connect({
		host: sourceLocalIP,
		username,
		password
	});

	const isLocked = await sshInstance.execCommand(isLockedCommand);
	if(isLocked.stdout) {
		console.warn('Already connected to', isLocked.stdout, 'killing');
		await sshInstance.execCommand(killCommand);
		cleanup();
	} else {
		await sshInstance.execCommand(lockCommand);
		console.warn('Start binding to ', destination?.name, 'from', source?.name);
		await sshInstance.exec(linkCommand, [], {
			onStdout(chunk) {
				console.log('out:', chunk.toString('utf8'));
				startDiscovery(); 
				startManualDiscovery();
			},
			onStderr(chunk) {
				console.log('err:', chunk.toString('utf8'));
				startDiscovery(); 
				startManualDiscovery();
			},
			onChannel: (client) => {
				clientChannel = client;
			}
		});
	}
}

ipcMain.on("bindAuxToAMP", (event, arg) => {
	connectSSH();
});

let manuallyDiscoveredProduct: Service | null = null;
let manualDiscoveryInterval: NodeJS.Timer | null = null;
let manualDiscoveryAddress = "10.0.0.1";

async function discoverProductAtAddress(address: string): Promise<void> {
	if (bonjourProductCount == 0) {
		try {
			const discovery = await fetch('http://'+address+'/product-information/discovery');
			if(discovery.ok) {
				const body = await discovery.json();
				const service = {
					name: body.name, 
					fullname: body.name+"._"+body.serviceType+"._tcp.local.", 
					port: body.advertisePort, 
					addresses: [address], 
					host: address, 
					txt: body.txtRecord, 
					manual: true
				};
	
				if (!manuallyDiscoveredProduct) {
					manuallyDiscoveredProduct = service;
					refreshProducts();
				}
			} else {
				if (manuallyDiscoveredProduct != null) {
					manuallyDiscoveredProduct = null;
					refreshProducts();
				}
			}
		} catch (err) {
			console.error("Manual product discovery unsuccessful", err instanceof Error ? err.message : err);
		}
	} else {
		if (manuallyDiscoveredProduct != null) {
			manuallyDiscoveredProduct = null;
			refreshProducts();
		}
	}
}

function startManualDiscovery(): void {
	manuallyDiscoveredProduct = null;

	stopManualDiscovery();

	discoverProductAtAddress(manualDiscoveryAddress);
	manualDiscoveryInterval = setInterval(function() {
		discoverProductAtAddress(manualDiscoveryAddress);
	}, 10000);
}

function stopManualDiscovery(): void {
	if(!manualDiscoveryInterval) {
		return;
	}

	clearInterval(manualDiscoveryInterval);
}

let ipCheckInterval: NodeJS.Timer | null = null;
function startCheckingIPAddress(): void {
	hasIPChanged();
	ipCheckInterval = setInterval(function() {
		if (activeWindow) {
			if (hasIPChanged()) {
				startDiscovery();
				startManualDiscovery();
			}
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
