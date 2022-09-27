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
SOFTWARE.*/

// BEOCREATE CONNECT
const { app, Menu, BrowserWindow, ipcMain, nativeTheme, systemPreferences, shell } = require('electron')

const windowStateKeeper = require('electron-window-state');

const { Browser, tcp } = require("dnssd2")
const { networkInterfaces } = require("os");

const { NodeSSH } = require('node-ssh')

let debug = false;
let activeWindow = true;

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
	  click () { win.webContents.send('reloadProductView') }, accelerator: "CmdOrCtrl+R"},
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

const menu = Menu.buildFromTemplate(template as any);
Menu.setApplicationMenu(menu);

let win
  
function createWindow () {
    // Create the browser window.
	let mainWindowState = windowStateKeeper({
	    defaultWidth: 820,
	    defaultHeight: 600
	  });
    //win = new BrowserWindow({width: 800, height: 600, minWidth: 450, minHeight: 300, acceptFirstMouse: true, titleBarStyle: 'hiddenInset', title: "Bang & Olufsen Create", webPreferences: { scrollBounce: false }});
	let hasFrame = true;
	if (process.platform !== 'darwin') {
	  hasFrame = false;
	}
	win = new BrowserWindow({
		nodeIntegration: true,
		contextIsolation: false,
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
			win.webContents.send('colourSchemeIsDark', nativeTheme.shouldUseDarkColors);
		}
		win.webContents.send('styleForWindows', process.platform !== 'darwin');
		setTimeout(function() {
			win.show();
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
	  clearInterval(ipCheckInterval);
	  stopDiscovery();
	  if(sshInstance) {
		sshInstance.dispose();
	  }
    });
    
    win.on('focus', () => {
    	win.webContents.send('windowEvent', "activate");
		refreshProducts(null);
		activeWindow = true;
    });
    
    win.on('blur', () => {
    	win.webContents.send('windowEvent', "resignActive");
		activeWindow = null;
    });
	
	win.on("enter-full-screen", () => {
		win.webContents.send('windowEvent', "fullScreen");
	});
	
	win.on("leave-full-screen", () => {
		win.webContents.send('windowEvent', "windowed");
	});
	
	win.webContents.on('new-window', function(event, url){
	  event.preventDefault();
	  shell.openExternal(url);
	});
}
  
app.on('ready', createWindow)

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
})
  

// DARK / LIGHT MODE
if (process.platform == "darwin" && win) {
	systemPreferences.subscribeNotification(
	  'AppleInterfaceThemeChangedNotification',
	  function theThemeHasChanged () {
		win.webContents.send('colourSchemeIsDark', nativeTheme.shouldUseDarkColors);
	  }
	)
}
  
// FIND BEOCREATE SYSTEMS
let browser = null;
let startedOnce = false;
function startDiscovery(once?: boolean) { // Start or restart discovery.
	if (!once || !startedOnce) {
	  	if (!browser) {
		  	browser = new Browser(tcp('beocreate'), {maintain: true});
	
	  		browser.on('serviceUp', service => discoveryEvent("up", service));
	  		browser.on('serviceDown', service => discoveryEvent("down", service));
	  		browser.on('serviceChanged', service => discoveryEvent("changed", service));
	  		browser.on('error', error => console.log("dnssd error: "+error));
	  	} else {
	  		stopDiscovery();
	  	}

	  	console.log("Starting discovery.");
		browser.start();
		bonjourProductCount = 0;
		startedOnce = true;
  }
}

function stopDiscovery() {
	if (browser) {
		browser.stop();
		products = {};
		bonjourProductCount = 0;
		console.log("Stopping discovery.");
		if (win) win.webContents.send('discoveredProducts', products);
	}
}

let products = {};
let bonjourProductCount = 0;

function discoveryEvent(event: string, service: { fullname: string | number; addresses: any; txt: any; }) {
	if (debug) console.log(event, new Date(Date.now()).toLocaleString(), service.fullname, service.addresses, service.txt);
	if (event == "up" || event == "down") {
		let list = browser.list();
		//list = [];
		if (list) refreshProducts(list);
		bonjourProductCount = (list) ? list.length : 0;
	}
	
	if (event == "changed") {
		if (products[service.fullname]) {
			setProductInfo(service);
			win.webContents.send('updateProduct', products[service.fullname]);
		}
	}
	
}

function refreshProducts(services?: any[]) {
	if (services == null) {
		services = [];
		if (browser) services = browser.list();
	}
	if (services.length == 0 && manuallyDiscoveredProduct) services.push(manuallyDiscoveredProduct);
	if (services) {
		// Find out which services have been added.
		for (let s = 0; s < services.length; s++) {
			if (!products[services[s].fullname]) {
				setProductInfo(services[s]); // Adds product.
				//console.log(products[services[s].fullname].addresses);
				win.webContents.send('addProduct', products[services[s].fullname]);
			}
		}
		
		// Find out which services have been removed.
		for (let fullname in products) {
			let serviceFound = -1;
			for (let s = 0; s < services.length; s++) {
				if (services[s].fullname == fullname) serviceFound = s;
			}
			if (serviceFound == -1) {
				win.webContents.send('removeProduct', products[fullname]);
				delete products[fullname]; // Removes product.
			}
		}
	}
}

function setProductInfo(service: { fullname: any; addresses: any; txt: any; host?: any; port?: any; name?: any; manual?: any; }) {
	let modelID = null;
	let modelName = null;
	let systemID = null;
	let systemStatus = null;
	let productImage = null;
	for (let key in service.txt) {
	    if (service.txt.hasOwnProperty(key)) {
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
	}
	let product = {
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
	};

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
	win.webContents.send('discoveredProducts', products);
});

ipcMain.on("refreshProducts", (event, arg) => {
	startDiscovery(); 
	startManualDiscovery();
});

let clientChannel = null;
let sshInstance = null;
let currentRouting = null;
function connectSSH() {
	if(sshInstance) {
		sshInstance.dispose();
		clientChannel.close();
		clientChannel = null;
		sshInstance = null;
		return;
	}

	sshInstance = new NodeSSH()

	currentRouting = {
		from: 'AuxBerry',
		to: 'HiFiBerry',
	};

	const productKeys = Object.keys(products);

	const source = productKeys.find(key => {
		const product = products[key];
		if(product.name === currentRouting.from) {
			return key;
		}

		return null;
	});

	const destination = productKeys.find(key => {
		const product = products[key];
		if(product.name === currentRouting.to) {
			return key;
		}

		return null;
	});

	console.warn('source', products[source], 'dest', products[destination]);

	const bitrate = "-f S24_LE";
	const codec = "-t wav";
	const samplingRate = "-r 60000";
	const channels = "-c2"

	const audioParams = `${bitrate} ${codec} ${samplingRate} ${channels}`;

	return sshInstance.connect({
		host: products[source].addresses[0],
		username: 'root',
		password: 'hifiberry'
	}).then(() => {
		// @todo : Add settings to create this command dynamically.
		return sshInstance.execCommand(`arecord -D plughw:0,0 ${audioParams} | ssh -C root@${products[destination].addresses[0]} -i rcaberry aplay ${audioParams}`, {
			// @note : hack, without this, channel.close don't work.
			pty: true,
			onChannel: (client) => {
				clientChannel = client;
				setTimeout(() => {
					refreshProducts();
				}, 500);
			} 
		}).then(function(result) {
			// @note : enforce killall on error (enable switch aspect of the button)
			if(result.stderr) {
				sshInstance?.execCommand('killall arecord').then(() => {
					sshInstance?.dispose();
					clientChannel?.close();
					clientChannel = null;
					sshInstance = null;
					currentRouting = null;
					setTimeout(() => {
						refreshProducts();
					}, 500);
				});
			}
			console.log('STDOUT: ' + result.stdout)
			console.log('STDERR: ' + result.stderr)
		});
	});
}

ipcMain.on("bindRCAToAMP", (event, arg) => {
	connectSSH();
});

let manuallyDiscoveredProduct = null;
let manualDiscoveryInterval: string | number | NodeJS.Timeout;
let manualDiscoveryAddress = "10.0.0.1";
async function discoverProductAtAddress(address: string): Promise<void> {
	if (bonjourProductCount == 0) {
		const { fetch } = await import('got-fetch');
		fetch('http://'+address+'/product-information/discovery').then(res => {
			if (res.status == 200) {
				res.json().then(body => {
					const service = {name: body.name, fullname: body.name+"._"+body.serviceType+"._tcp.local.", port: body.advertisePort, addresses: [address], host: address, txt: body.txtRecord, manual: true};
					if (!manuallyDiscoveredProduct) {
						manuallyDiscoveredProduct = service;
						refreshProducts();
					}
				});
			} else {
				if (manuallyDiscoveredProduct != null) {
					manuallyDiscoveredProduct = null;
					refreshProducts();
				}
			}
		}).catch(err => {
			console.error("Manual product discovery unsuccessful")
		});
	} else {
		if (manuallyDiscoveredProduct != null) {
			manuallyDiscoveredProduct = null;
			refreshProducts();
		}
	}
}

function startManualDiscovery(): void {
	manuallyDiscoveredProduct = null;
	clearInterval(manualDiscoveryInterval);
	discoverProductAtAddress(manualDiscoveryAddress);
	manualDiscoveryInterval = setInterval(function() {
		discoverProductAtAddress(manualDiscoveryAddress);
	}, 10000);
}

function stopManualDiscovery(): void {
	clearInterval(manualDiscoveryInterval);
}

let ipCheckInterval: string | number | NodeJS.Timeout;
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
		for (let i = 0; i < ifaces[iface].length; i++) {
			if (ifaces[iface][i].family == "IPv4") {
				newIPs.push(ifaces[iface][i].address);
			}
		}
	}
	if (equals(newIPs)) {
		return false;
	} else {
		oldIPs = newIPs;
		return true;
	}
}

function equals(array: unknown[]): boolean {
    if (!array){
		return false;
	}

    if (this.length != array.length) {
        return false;
	}

    for (let i = 0, l=this.length; i < l; i++) {
        if (this[i] instanceof Array && array[i] instanceof Array) {
            if (!this[i].equals(array[i])) {
                return false;
			}
        } else if (this[i] != array[i]) {
            return false;
        }
    }

    return true;
}
