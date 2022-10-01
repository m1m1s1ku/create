/* Copyright 2018-2020 Bang & Olufsen A/S
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
const inElectron = true;
let debug = true;

const { ipcRenderer, shell, remote } = require('electron');
const ipc = ipcRenderer;

let darkAppearance = false;
let windows = false;

window.matchMedia("(prefers-color-scheme: dark)").addListener(e => e.matches && setAppearance(true))
window.matchMedia("(prefers-color-scheme: light)").addListener(e => e.matches && setAppearance(false))

function setAppearance(dark) {
	if (dark == undefined) {
		dark = false;
		dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	}
	if (dark == true) {
		console.log("Setting appearance to dark.");
		document.body.classList.add('dark');
		darkAppearance = true;
	} else if (dark == false) {
		console.log("Setting appearance to light.");
		document.body.classList.remove('dark');
		darkAppearance = false;
	}
}

// OPEN LINKS IN BROWSER
// This works for links directly in the UI, for links within the product view there is code in main.js.

const clickableItems = document.querySelectorAll('a[href^="http"]');
for(const clickableItem of Array.from(clickableItems)) {
	clickableItem.addEventListener('click', function(event) {
		event.preventDefault();
		if (shell) {
			shell.openExternal(this.href);
		}
	})
}

document.addEventListener('DOMContentLoaded', () => {
	if(inElectron) {
		document.body.classList.add('electron');
	}

	setAppearance();
	document.body.classList.add('first-menu-visit');

	titleBarMode("normal");
	toggleMenu(true);
	setTimeout(function() {
		document.body.classList.remove('no-dark-ui-animation');
	}, 500);
});

// WINDOW EVENTS

if (ipc) {
	ipc.on('windowEvent', (event, message) => {
		if (message == "activate") {
			document.body.classList.replace('inactive', 'active');
		}
		if (message == "resignActive") {
			document.body.classList.replace('active', 'inactive');
		}
		if (message == "fullScreen") {
			document.body.classList.replace('windowed', 'full-screen');
		}
		if (message == "windowed") {
			document.body.classList.replace('full-screen', 'windowed');
		}
	});
	ipc.on('colourSchemeIsDark', (event, message) => {
		setAppearance(message);
		sendToProductUI({header: "hasDarkAppearance", content: darkAppearance});
	});
	ipc.on('styleForWindows', (event, message) => {
		if (message == true) {
			windows = true;
			document.body.classList.replace('mac', 'windows');
		} else {
			windows = false;
			document.body.classList.replace('windows', 'mac');
		}
	});
	
	ipc.on('reloadProductView', (event) => {
		const productView = document.getElementById('product-view');
		productView.setAttribute('src', productView.getAttribute('src'));
	});
}

let windowTitle = "";
function setWindowTitle(title) {
	if (!title) {
		document.getElementById('title-bar').classList.remove('title');
	} else {
		windowTitle = title;
		document.getElementById('window-title').innerText = title;
	}
}

function showWindowTitle(show) {
	const titleBar = document.querySelector('#title-bar');

	if (show && windowTitle) {
		titleBar.classList.add('title');
	} else {
		titleBar.classList.remove('title');
	}
}


// TITLE BAR

function titleBarMode(mode) {
	switch (mode) {
		case "normal":
			const titleBar = document.querySelector('#title-bar');
			titleBar.classList.replace('dark', 'visible');
			break;
	}
}


(function handleWindowControls() {
    // When document has loaded, initialise
    document.onreadystatechange = () => {
        if (document.readyState == "complete") {
            init();
        }
    };

    function init() {
        if (remote) {
			window = remote.getCurrentWindow();
		}
        const minButton = document.getElementById('min-button'),
            maxButton = document.getElementById('max-button'),
            restoreButton = document.getElementById('restore-button'),
            closeButton = document.getElementById('close-button');

        minButton.addEventListener("click", event => {
            if (remote) {
				window = remote.getCurrentWindow();
				window.minimize();
			}
        });

        maxButton.addEventListener("click", event => {
            if (remote) {
				window = remote.getCurrentWindow();
				window.maximize();
				toggleMaxRestoreButtons();
			}
        });

        restoreButton.addEventListener("click", event => {
            if (remote) {
				window = remote.getCurrentWindow();
				window.unmaximize();
				toggleMaxRestoreButtons();
			}
        });

        // Toggle maximise/restore buttons when maximisation/unmaximisation
        // occurs by means other than button clicks e.g. double-clicking
        // the title bar:
        toggleMaxRestoreButtons();
		// window.addEventListener('maximize')
        // window.on('maximize', toggleMaxRestoreButtons);
        // window.on('unmaximize', toggleMaxRestoreButtons);

        closeButton.addEventListener("click", event => {
            window = remote.getCurrentWindow();
            window.close();
        });

        function toggleMaxRestoreButtons() {
			if (remote && windows) {
	            window = remote.getCurrentWindow();
	            if (window.isMaximized()) {
	                maxButton.style.display = "none";
	                restoreButton.style.display = "flex";
	            } else {
	                restoreButton.style.display = "none";
	                maxButton.style.display = "flex";
	            }
			}
        }
    }
})();


// MAIN MENU

// Beautiful and bold colours designed by Polly Bosworth. Use them in fun combinations!
let menuColourThemes = [
	["mariner", "waterleaf", "spindle"],
	["turquoise", "waxflower", "yellow"],
	["turquoise", "waterleaf", "spindle"],
	["turquoise", "spindle", "cherub"],
	["carnation", "cherub", "spindle"]
];

let menuOpen = true;
let menuTimeout;
let shouldEnableRefreshButton = false;

function toggleMenu(force) {
	clearTimeout(menuTimeout);
	if (force != undefined) {
		if (force == true) menuOpen = false;
		if (force == false) menuOpen = true;
	}
	if (menuOpen == false) {
		document.getElementById('main-menu').classList.add('show');
		document.body.classList.add('animating-menu', 'in-menu');

		if (currentAssistant) {
			endAssistant(true);
		} 

		menuTimeout = setTimeout(function() {
			document.querySelector('#main-menu').classList.add('visible');
			menuTimeout = setTimeout(function() {
				document.body.classList.remove('animating-menu');
			}, 1000);
		}, 20);
		document.querySelector('#menu-button').classList.add('menu-open');
		document.querySelector('#refresh-button').classList.remove('disabled');

		menuOpen = true;
		showWindowTitle(false);
		connectOnDiscovery = {identifier: null, productName: null};
	} else {
		document.getElementById('main-menu').classList.remove('show');

		connectOnDiscovery = {identifier: null, productName: null};
		if (currentAssistant) startAssistant();
		if (shouldEnableRefreshButton) {
			document.querySelector('#refresh-button').classList.remove('disabled');
		} else {
			document.querySelector('#refresh-button').classList.add('disabled');
		}
		document.body.classList.replace('in-menu', 'animating-menu');
		document.querySelector('#main-menu').classList.remove('visible');
		document.querySelector('#menu-button').classList.remove('menu-open');
		
		menuTimeout = setTimeout(function() {
			document.querySelector('#menu-button').classList.remove('show');
			document.body.classList.remove('first-menu-visit', 'animating-menu');
			document.body.classList.add('second-menu-visit');
		}, 1050);
		menuOpen = false;
		showWindowTitle(true);
	}
}

function showMenuButton(show) {
	if (show) {
		document.querySelector('#menu-button').classList.remove('disabled');
	} else {
		document.querySelector('#menu-button').classList.add('disabled');
	}
}

function productNotification(title, description) {
	const productNotification = document.querySelector('#product-notification');

	if (!title || !description) {
		productNotification.classList.remove('hidden');
	} else {
		productNotification.classList.remove('hidden');
		productNotification.querySelector('h3').innerText = title;
		productNotification.querySelector('p').innerText = description;
	}
}

document.addEventListener("scroll", function(event) {
	if (event.target.id == "main-menu-scroll-area") {
		scrollPos = document.querySelector('#main-menu-scroll-area').scrollTop;
		document.querySelector('#main-menu .colour-background .element-2').style.transform = "translateY("+scrollPos*-0.5+"px)";
		document.querySelector('#main-menu .colour-background .element-3').style.transform = "translateY("+scrollPos*-0.2+"px)";
	}
}, true);


let inProductView = false;

function showSection(sectionID, closeMenu, screenID) {
	inProductView = (sectionID == "product-view") ? true : false;
	if (screenID) {
		showScreen(screenID);
	}
	document.querySelector('.app-section').classList.remove('visible');
	
	setTimeout(function() {
		document.querySelector('.app-section').classList.remove('show');
		document.querySelector("#"+sectionID).classList.add('show');

		setTimeout(function() {
			document.querySelector("#"+sectionID).classList.add('visible');
		}, 50);
	}, 500);
	if (closeMenu) {
		toggleMenu(false);
	}
}

const getSiblings = (el, sel) => {
    const siblings = [];
    let targets;
    if (sel)
        targets = el.parentNode.querySelectorAll(':scope > ' + sel)
    else
        targets = el.parentNode.children;

    for (const target of targets) {
        if (target !== el)
            siblings.push(target);
    }
    return siblings;
};

function showScreen(screenID, direction) {
	const screenNode = document.querySelector('#'+screenID);

	if (!direction) {
		screenNode.classList.remove('left', 'right');

		for(const sibling of getSiblings(screenNode, '.menu-screen.visible')){
			sibling.classList.remove('left', 'right');
		}
	} else if (direction == "left-right") {
		screenNode.classList.replace('right', 'left');
		for(const sibling of getSiblings(screenNode, '.menu-screen.visible')){
			sibling.classList.replace('left', 'right');
		}
	} else if (direction == "right-left") {
		screenNode.classList.replace('left', 'right');
		for(const sibling of getSiblings(screenNode, '.menu-screen.visible')){
			sibling.classList.replace('right', 'left');
		}
	}
	for(const sibling of getSiblings(screenNode, '.menu-screen.visible')){
		sibling.classList.remove('visible');
	}

	setTimeout(function() {
		for(const sibling of getSiblings(screenNode, '.menu-screen')){
			sibling.classList.remove('show');
		}
		screenNode.classList.add('show');

		setTimeout(function() {
			screenNode.classList.add('visible');
		}, 50);
	}, 500);
}

function disclosure(disclosureID) {
	const disclosure = document.querySelector('#'+disclosureID);
	if(!disclosure.classList.contains('show')) {
		disclosure.classList.add('show');
	} else {
		disclosure.classList.remove('show');
	}
}

function toggle(inElement, outElement) {
	inElement.classList.remove('hidden');
	outElement.classList.add('hidden');
}

// PRODUCT DISCOVERY

// Receives discovered products from the app.
let products = {};

selectedProduct = null;

let connectOnDiscovery = {identifier: null, systemName: null};
let refreshing = false;

if (ipc) {
	setTimeout(function() {
		ipc.send("getAllProducts");
	}, 1000);
	
	ipc.on('discoveredProducts', (event, message) => {
		products = message;
		updateProductLists();
	});
	
	ipc.on('addProduct', (event, product) => {
		products[product.fullname] = product;
		addProduct(product);
		document.querySelector('.no-products').classList.add('hidden');
	});
	
	ipc.on('updateProduct', (event, product) => {
		products[product.fullname] = product;
		updateProduct(product);
	});
	
	ipc.on('removeProduct', (event, product) => {
		fullname = product.fullname;
		document.querySelector(".found-products .discovered[data-product-fullname=\""+fullname+"\"]").classList.add('animated-hide');
		setTimeout(function() {
			const productNode = document.querySelector(".found-products .discovered[data-product-fullname=\""+fullname+"\"]");
			productNode.parentElement.removeChild(productNode);
		}, 400);
		delete products[fullname];
		if (Object.keys(products).length == 0) {
			const noProducts = document.querySelector('.no-products');
			setTimeout(function() {
				noProducts.classList.replace('hidden', 'fade-hide');

				setTimeout(function() {
					noProducts.classList.remove('fade-hide');
				}, 100);
				const productNode = document.querySelector(".found-products .discovered[data-product-fullname=\""+fullname+"\"]");
				productNode.parentElement.removeChild(productNode);
			}, 400);
		}
		if (debug) {
			console.log("Removing", fullname);
		}
	});
	
	ipc.on('availableDrives', (event, drives) => {
		console.log(drives);
		document.querySelector('#drive-list').innerHTML = '';
		for (d in drives) {
			if (drives[d].busType == "USB") { // Only list USB drives.
				size = Math.round(drives[d].size/100000000)/10;
				if (size > 3) { // Make sure drive is large enough.
					document.querySelector('#drive-list').innerHTML = '<div class="menu-item" onclick="selectDrive(\''+drives[d].raw+'\');"><div class="menu-label">'+drives[d].description+'</div><div class="menu-value">'+size+' GB</div></div>';
				}
			}
		}
	});
}

function refresh() {
	if (menuOpen) {
		ipc.send("refreshProducts");
	} else {
		const productView = document.querySelector('#product-view');
		productView.setAttribute('src', productView.getAttribute('src'));
	}
}

function bindAuxToAMP() {
	ipc.send("bindAuxToAMP");
}

function updateProductLists() {
	refreshing = true;

	const discovered = document.querySelector('.found-products .discovered');
	if(discovered) {
		discovered.parentElement.removeChild(discovered);
	}

	for (fullname in products) {
		addProduct(products[fullname]);
	}

	if (Object.keys(products).length != 0) {
		document.querySelector('.no-products').classList.add('hidden');
		if (debug) {
			console.log("Products:", Object.keys(products).length);
		}
	} else {
		document.querySelector('.no-products').classList.remove('hidden');

		if (debug) {
			console.log("No products.");
		}
	}
	refreshing = false;
}

function addProduct(product) {
	info = getProductInfo(product);
	console.log(connectOnDiscovery.identifier, product.systemID);
	if (connectOnDiscovery.identifier != null) {
		// Check if this product is the one that should be automatically reconnected.
		if (product.systemID == connectOnDiscovery.identifier) {
			configureProduct(product.fullname, true);
			productNotification();
		}
	}
	const foundProduct = document.querySelector(".found-products .discovered[data-product-fullname=\""+product.fullname+"\"]");
	if(foundProduct) {
		foundProduct.parentElement.removeChild(foundProduct);
	}

	const firstSpacer = document.querySelector('.found-products .spacer.first');
	const collectionItem = document.createElement('div');
	collectionItem.classList.add('collection-item', 'product-item', 'discovered', 'animated-hide', ...info.classes);
	collectionItem.addEventListener('click', (e) => {
		configureProduct(product.fullname);
	});
	collectionItem.dataset.productFullname = product.fullname;
	collectionItem.innerHTML = `<img class="square-helper" src="images/square-helper.png">
	<div class="collection-item-content">
		<img class="collection-icon" src="${info.image}">
		<div class="collection-item-text">
			<!-- <div class="collection-label upper product-type">${info.model}</div> -->
			<div class="product-type collection-label upper">${product.name}</div>
			<div class="bound-to collection-label lower">${product.boundTo ? `<svg style="width: 1em" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
			<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
		  </svg> ${product.boundTo}` : ''}</div>
		</div>
	</div>`;

	firstSpacer.parentNode.insertBefore(collectionItem, firstSpacer);

	setTimeout(function() {
		collectionItem.classList.remove('animated-hide');
	}, 100);
	if (debug) {
		console.log("Adding", product.fullname);
	}
}

function updateProduct(product) {
	info = getProductInfo(product);
	const productNode = document.querySelector('.product-item[data-product-fullname="'+product.fullname+'"]');
	productNode.classList.remove('normal', 'yellow', 'red', 'legacy', 'configure');
	productNode.classList.add(...info.classes);
	productNode.querySelector('.product-type').innerText = info.model;
	productNode.querySelector('.collection-icon').setAttribute('src', info.image);
}

function getProductInfo(product) {
	image = "images/product-images/beocreate.png";
	model = "Beocreate";
	classes = [];
	if (product.legacyProduct) {
		classes.push("legacy", "configure");
	} else {
		if (product.productImage != null) image = "http://"+product.addresses[0]+":"+product.port+product.productImage;
		if (product.modelName != null) model = product.modelName;
		if (model.toLowerCase() == "beocreate 4-channel amplifier") model = "Beocreate";
		classes.push("configure");
		if (product.systemStatus) {
			switch (product.systemStatus) {
				case "normal":
					// No need to add any classes.
					break;
				case "yellow":
				case "red":
					classes.push(product.systemStatus);
					break;
			}
		}
	}
	return {model: model, image: image, classes: classes};
}

let productConnectionStatus = "disconnected";

function configureProduct(fullname, fromDiscovery) {
	if (products[fullname]) {
		shouldEnableRefreshButton = true;
		endAssistant();
		setWindowTitle(products[fullname].name);
		showMenuButton(true);
		connectOnDiscovery = {identifier: null, productName: null};
		productIP = products[fullname].addresses[0]+":"+products[fullname].port;
		selectedProduct = JSON.parse(JSON.stringify(products[fullname]));
		src = document.querySelector('#product-view').getAttribute('src');
		if (!src || fromDiscovery || src.indexOf("http://"+productIP+"/") == -1 || productConnectionStatus == "disconnected") {
			/*
			Reload if any of the following is true:
			- Product view has no source
			- This is a "connect on discovery" request
			- The product view URL is not the requested URL
			- The product currently in view is disconnected (maybe it was shut down last time)
			*/
			document.querySelector('#product-view').setAttribute('src', "http://"+productIP+"/");
		}
		showSection("product-view", true);
	}
}

// Right-click menu for products
if (remote) {
	const productContextMenu = new Menu();
	productContextMenu.append(new MenuItem({ label: 'Copy Link', click() { console.log('item 1 clicked') } }));
	productContextMenu.append(new MenuItem({ label: 'Open in Web Browser', click() { console.log('item 1 clicked') } }));
	productContextMenu.append(new MenuItem({ type: 'separator' }));
	productContextMenu.append(new MenuItem({ label: 'Hide Product...', click() { console.log('item 1 clicked') } }));
	
	window.addEventListener('contextmenu', (e) => {
	  e.preventDefault();
	  productContextMenu.popup({ window: remote.getCurrentWindow() });
	}, false);
}

// ASSISTANT FLOW

let currentAssistant = null;
function startAssistant(assistant) {
	if (assistant) currentAssistant = assistant;
	shouldEnableRefreshButton = false;
	setTimeout(function() {
		document.querySelector('#assistant-bar').classList.add('show');
		setTimeout(function() {
			document.body.classList.add('assistant');
		}, 100);
	}, 500);
	if (assistant) {
		switch (assistant) {
			case "createCard":
				setWindowTitle("Prepare a MicroSD Card");
				assistantFlow();
				break;
			case "findAndSetUp":
				setWindowTitle("First-Time Setup");
				assistantFlow();
				break;
		}
	}
}

function assistantButtons(previousText, nextText) {
	document.querySelector('#assistant-previous').innerText = previousText;
	document.querySelector('#assistant-next').innerText = nextText;
}

function enableAssistantButtons(previousEnabled, nextEnabled) {
	if (previousEnabled) {
		document.querySelector('#assistant-previous').classList.remove('disabled');
	} else {
		document.querySelector('#assistant-previous').classList.add('disabled');
	}
	if (nextEnabled) {
		document.querySelector('#assistant-next').classList.remove('disabled');
	} else {
		document.querySelector('#assistant-next').classList.add('disabled');
	}
}

function endAssistant(hideOnly) {
	document.body.classList.remove('assistant');
	setTimeout(function() {
		document.querySelector('#assistant-bar').classList.remove('show');
	}, 500);
	if (!hideOnly) {
		currentAssistant = null;
	}
}

let assistantStep = 0;
function assistantFlow(step) {
	if (step != undefined) {
		if (isNaN(step)) {
			if (step == "next") {
				assistantStep++;
				direction = "right-left";
			}
			if (step == "previous") {
				assistantStep--;
				direction = "left-right";
			}
		} else {
			assistantStep = step;
			direction = false;
		}
	} else {
		assistantStep = 0;
		direction = false;
	}

	switch (currentAssistant) {
		case "findAndSetUp":
			switch (assistantStep) {
				case 0:
					assistantButtons("Cancel", "Next Step");
					enableAssistantButtons(true, true);
					showScreen('sd-to-product', direction);
					showMenuButton(true);
					break;
				case 1:
					assistantButtons("Previous Step", "Next Step");
					showScreen('connect-power', direction);
					enableAssistantButtons(true, true);
					break;
				case 2:
					assistantButtons("Previous Step", "Next Step");
					enableAssistantButtons(true, false);
					showScreen('wait-for-discovery', direction);
					//ipc.send("refreshProducts");
					break;
			}
			break;
	}
}


// SD CARD FLOW

function selectDrive(raw) {
	console.log(raw);
}


// COMMUNICATIONS FROM THE PRODUCT UI
window.addEventListener("message", function(event) {
	data = JSON.parse(event.data);

	if(!data.header) {
		return;
	}

	switch (data.header) {
		case "isShownInBeoApp":
			sendToProductUI({header: "isShownInBeoApp", content: true});
			sendToProductUI({header: "hasDarkAppearance", content: darkAppearance});
			break;
		case "systemName":
			if (inProductView) {
				setWindowTitle(data.content.name);
			}
			break;
		case "autoReconnect":
			connectOnDiscovery = {identifier: data.content.systemID, systemName: data.content.systemName};
			productNotification(data.content.systemName+" will be automatically reconnected", "Make sure this computer is connected to the same network as the product.");
			break;
		case "connection":
			if (data.content.status) productConnectionStatus = data.content.status;
			break;
		case "powerStatus":
			if (data.content.status == "rebooting") {
				if (debug) console.log("Product is starting a reboot.");
				connectOnDiscovery = {identifierType: "systemID", identifier: data.content.systemID, systemName: data.content.systemName};
			} else if (data.content.status == "shuttingDown") {
				if (debug) console.log("Product is starting a shutdown.");
			}
			break;
	}
});

function sendToProductUI(data) {
	document.getElementById("product-view").contentWindow.postMessage(JSON.stringify(data), "*");
}

