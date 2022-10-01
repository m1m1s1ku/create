import { Product, Service } from "./beocreate-connect";
import { fetch } from 'cross-fetch';
import { BrowserWindow } from "electron";
import { Browser, tcp } from "dnssd2";
import { getCurrentRouting } from "./main";

let manuallyDiscoveredProduct: Service | null = null;
let manualDiscoveryInterval: NodeJS.Timer | null = null;
let manualDiscoveryAddress = "10.0.0.1";

let bonjourProductCount = 0;

// FIND BEOCREATE SYSTEMS
let browser: {
	on: (eventName: string, callback: (service: Service) => void) => void;
	start: () => void;
	stop: () => void;
	list: () => Service[];
} | null = null;
let startedOnce = false;

let products: Record<string, Service> = {};

export function getProducts() {
    return products;
}

export function startDiscovery(win: BrowserWindow | null, once?: boolean) { // Start or restart discovery.
	if (!once || !startedOnce) {
	  	if (!browser) {
		  	browser = new Browser(tcp('beocreate'), {maintain: true});
	
	  		browser?.on('serviceUp', service => discoveryEvent("up", service, win));
	  		browser?.on('serviceDown', service => discoveryEvent("down", service, win));
	  		browser?.on('serviceChanged', service => discoveryEvent("changed", service, win));
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

export function stopDiscovery(win?: BrowserWindow | null) {
	if(!browser) { return; }

	browser.stop();
	products = {};
	bonjourProductCount = 0;

	console.log("Stopping discovery.");

	if (win) {
		win.webContents.send('discoveredProducts', products);
	}
}

export function findProduct(name: string) {
	const productKey = Object.keys(products).find(key => {
		const product = products[key];
		if(product.name === name) {
			return key;
		}

		return null;
	});

	return productKey && products[productKey] ? products[productKey] : null;
}

export async function refreshProducts(win: BrowserWindow, services?: Service[] | null): Promise<void> {
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
				await setProductInfo(services[s]); // Adds product.
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

export async function setProductInfo(service: Service): Promise<Product> {
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

    const routing = await getCurrentRouting();

	// @note : auto-magic bind (jack button => reflect by bolt on UI)
	if(routing && routing.from === service.name) {
		product.boundTo = routing.to;
	} else if(routing && routing.to === service.name) {
		product.boundTo = routing.from;
	}

	if (service.manual) {
		product.manual = true;
	} 
	products[service.fullname] = product;
	return product;
}


async function discoveryEvent(event: string, service: Service, win: BrowserWindow | null): Promise<void> {
	if (true) {
		console.log(event, new Date(Date.now()).toLocaleString(), service.fullname, service.addresses, service.txt);
	}
	
	if (event == "up" || event == "down") {
		const list = browser?.list() ?? [];

		if (list && win) {
			await refreshProducts(win, list);
		}

		bonjourProductCount = list ? list.length : 0;
	}
	
	if (event == "changed") {
		if (products[service.fullname]) {
			await setProductInfo(service);
			win?.webContents.send('updateProduct', products[service.fullname]);
		}
	}
}

async function performNetworkDiscovery(address: string, win: BrowserWindow) {
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
				await refreshProducts(win!);
			}
		} else {
			if (manuallyDiscoveredProduct != null) {
				manuallyDiscoveredProduct = null;
				await refreshProducts(win!);
			}
		}
	} catch (err) {
		console.error("Manual product discovery unsuccessful", err instanceof Error ? err.message : err);
	}
}

async function discoverProductAtAddress(address: string, win: BrowserWindow | null): Promise<void> {
	if(bonjourProductCount === 0 && win) {
		performNetworkDiscovery(address, win);
		return;
	}

	if(manuallyDiscoveredProduct === null) { return; }

	manuallyDiscoveredProduct = null;
	await refreshProducts(win!);
}

export function startManualDiscovery(win: BrowserWindow | null): void {
	manuallyDiscoveredProduct = null;

	stopManualDiscovery();

	discoverProductAtAddress(manualDiscoveryAddress, win);
	manualDiscoveryInterval = setInterval(function() {
		discoverProductAtAddress(manualDiscoveryAddress, win);
	}, 10000);
}

export function stopManualDiscovery(): void {
	if(!manualDiscoveryInterval) {
		return;
	}

	clearInterval(manualDiscoveryInterval);
}