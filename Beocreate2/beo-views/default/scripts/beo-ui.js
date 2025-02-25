/*
Copyright 2018 Bang & Olufsen A/S

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

let noExtensions = false;

let selectedExtension = null;
let stateRestored = false;
let historyConstructed = false;
let os = null;
let debug = true;
let developerMode = false;
let extensions = {};
let darkAppearance = false;

let beo = (function() {
	let uiSettings = {
		disclosure: {}
	};

	let os = getOS();
	let inBeoApp = false;
	document.addEventListener("DOMContentLoaded", function() {
		if (("standalone" in window.navigator) && window.navigator.standalone){
			document.body.classList.add('standalone');
		}
		if (developerMode) {
			document.body.classList.add('developer');
		}

		getWindowDimensions();
		sendToProductView({header: "isShownInBeoApp"});
		prepareMenus();
		prepareTabBar();
		updateInterfaceMode();
		setAppearance();
		
		beoCom.connectToCurrentProduct();
		
		document.body.style.opacity = "1";
		
		if (systemType == "hifiberry") {
			const touchIcon = document.querySelector('head link[rel="apple-touch-icon"]');
			touchIcon.setAttribute('href', 'views/default/apple-touch-icon-hifiberry.png')
		}

		document.querySelector("input[type=file]#file-input").addEventListener('change', function() {
			uploadFile(null, null, this.files[0]);
		})
		
		if (customisations && customisations.waitAnimation) {
			attentionIcon.src = customisations.waitAnimation;
		} else if (systemType == "beocreate") {
			attentionIcon.src = "common/create-wait-animate.svg";
		} else {
			attentionIcon.src = "common/hifiberry-wait-animate.svg";
		}

		document.querySelector('.device').innerText = os[1];
		
		setTimeout(function() {
			document.querySelector('nav.bar .image-cacher').classList.add('hidden');
		}, 2000);
	});

	darkAppearance = false;

	// RECEIVE MESSAGES FROM BEOCREATE APP
	window.addEventListener('message',function(event) {
		let data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
		if(!data.header) { return; }
		switch (data.header) {
			case "isShownInBeoApp":
				if (data.content == true) {
					document.body.classList.add('in-beo-app');
					inBeoApp = true;
				}
				break;
			case "hasDarkAppearance":
				if (data.content == true) {
					setAppearance(true);
				} else {
					setAppearance(false);
				}
				break;
		}
	});

	function sendToProductView(data) {
		window.parent.postMessage(JSON.stringify(data), '*');
	}

	document.addEventListener('general', (e, data) => {
		if (data.header == "powerStatus" && !data.content.overrideUIActions) {
			if (product_information && product_information.systemID && product_information.systemName) {
				if (data.content.status == "shuttingDown") {
					sendToProductView({header: "powerStatus", content: {status: "shuttingDown", systemID: product_information.systemID(), systemName: product_information.systemName()}});
					beoCom.setConnectionOptions({maxAttempts: 10, notifications: false});
					notify({title: "Shutting down product…", icon: "attention", message: "Leave power connected for at least 20 seconds to allow shutdown to finish.", timeout: false});
					setTimeout(function() {
						beo.notify({title: "Shutdown complete", message: "You may now unplug the product from power.", buttonAction: "beoCom.connectToCurrentProduct();", buttonTitle: "Connect Again", timeout: false});
						beoCom.setConnectionOptions({maxAttempts: 5, notifications: false});
					}, 20000);
				} else if (data.content.status == "rebooting") {
					sendToProductView({header: "powerStatus", content: {status: "rebooting", systemID: product_information.systemID(), systemName: product_information.systemName()}});
					notify({title: "Restarting product…", message: "This will take a moment, please wait.", icon: "attention", timeout: false});
					beoCom.setConnectionOptions({maxAttempts: 10, notifications: false});
				}
			}
		}
	});

	// USER INTERFACE SETUP

	let resizeTimeout;
	let windowHeight = 0;
	let windowWidth = 0;

	function getWindowDimensions() {
		windowHeight = window.innerHeight;
		windowWidth = window.innerWidth;
	}

	window.addEventListener('resize', function(){
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(function() {
			getWindowDimensions();
			updateSliderWidths();

			document.dispatchEvent(new CustomEvent('ui', {
				header: 'windowResized',
			}));
		}, 200);
	}, true);

	document.onkeydown = function(evt) {
		evt = evt || window.event;
		let isEscape = false;
		if ("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if (isEscape) {
			if (textInputOpen) {
				cancelText();
			} else if (askOpen) {
				ask();
			} else if (currentPopup) {
				popupBackplateClick('#open-popup', '#open-popup-back-plate', true);
			}
		}
	};

	let mainMenuExtension = null;
	let navigation = [];

	function prepareMenus() {
		console.log("Preparing menus...");
		
		if (navigationSets && navigationSets.length && navigationSets[0].items) {
			// Take first set as the main navigation.
			navigation = [].concat(navigationSets[0].items);
		}

		// List items specified in the manifest for navigation.
		let navExtensions = [];
		for (n in navigation) {
			if (navigation[n].kind == "extension") {
				navExtensions.push(navigation[n].name);
			}
		}
		
		// Sort extensions and filter out the ones that are in the navigation.
		let sortedExtensions = [];
		for (let e in extensions) {
			if (navExtensions.indexOf(e) == -1) {
				const theExtension = document.querySelector(".menu-screen#"+e);
				if (theExtension) {
					if (theExtension.attributes["data-sort-as"]) {
						sortedExtensions.push({name: e, sortName: theExtension.attributes["data-sort-as"].value});
					} else {
						sortedExtensions.push({name: e});
					}
				}
			}
		}
		sortedExtensions.sort(function(a, b) {
			nameA = (a.sortName) ? a.sortName : a.name;
			nameB = (b.sortName) ? b.sortName : b.name;
			return nameA > nameB ? 1 : -1;
		});
		
		// Add submenus based on the sort order.
		let unplacedExtensions = [];
		for (let e in sortedExtensions) {
			let extensionName = sortedExtensions[e].name;
			let extensionPlaced = false;
			const theExtension = document.querySelector(".menu-screen#"+extensionName);
			let context = null;
			if (theExtension.attributes["data-context"]) {
				context = theExtension.attributes["data-context"].value.split("/");
			} else if (theExtension.classList.contains("source")) {
				context = ["sources"];
			}
			
			if (context) {
				// Localise this screen or title.
				localiseExtension(theExtension, extensionName);
				
				let iconName = (theExtension.attributes["data-icon"]) ? theExtension.attributes["data-icon"].value : null;
				if (systemType == "hifiberry" && theExtension.attributes["data-icon-hifiberry"]) {
					iconName = theExtension.attributes["data-icon-hifiberry"].value;
				}
				
				let menuOptions = {
					label: theExtension.attributes["data-menu-title"].value,
					onclick: 'beo.showExtension(\''+extensionName+'\');',
					icon: extensions[extensionName].assetPath+"/symbols-black/"+iconName, // Still not quite sure if it looks better with or without icons.
					id: extensionName+'-menu-item',
					chevron: true,
					data: {"data-extension-id": extensionName},
					classes: []
				};
				if (theExtension.classList.contains("source")) {
					// Use icons for sources.
					menuOptions.icon = extensions[extensionName].assetPath+"/symbols-black/"+iconName;
					menuOptions.iconRight = "/common/symbols-black/volume.svg";
					menuOptions.classes.push("hide-icon-right", "source-menu-item");
				}
				if (theExtension.attributes["data-menu-value-class"]) {
					menuOptions.valueClasses = [theExtension.attributes["data-menu-value-class"].value];
					menuOptions.value = "";
				}
				if (theExtension.attributes["data-menu-attachment"]) {
					menuOptions.attachment = theExtension.attributes["data-menu-attachment"].value;
				}
				if (theExtension.attributes["data-menu-title-class"]) {
					menuOptions.labelClasses = [theExtension.attributes["data-menu-title-class"].value];
				}
				if (theExtension.attributes["data-menu-class"]) {
					menuOptions.classes.push(theExtension.attributes["data-menu-class"].value);
				}
				let hideExtension = false;
				if (theExtension.attributes["data-hidden"]) hideExtension = true;
				if (customisations && 
					customisations.hiddenExtensions &&
					customisations.hiddenExtensions.indexOf(extensionName) != -1) {
					hideExtension = true; // Skip adding this extension if it's hidden.
				}
				if (!hideExtension) {
					if (context[1]) {
						const dynamicMenu = document.querySelector(".menu-screen#"+context[0]+" .beo-dynamic-menu."+context[1]);
						if (dynamicMenu) {
							dynamicMenu.appendChild(createElementFromHTML(createMenuItem(menuOptions)));
							extensionPlaced = true;
						}
					}
					const dynamicMenuMain = document.querySelector(".menu-screen#"+context[0]+" .beo-dynamic-menu");
					if (!extensionPlaced && 
						dynamicMenuMain) {
						dynamicMenuMain.appendChild(createElementFromHTML(createMenuItem(menuOptions)));
						extensionPlaced = true;
					}
				} else {
					extensionPlaced = true;
				}
						
				extensions[extensionName] = Object.assign(extensions[extensionName], {
					id: extensionName, 
					parentMenu: context[0], 
					icon: iconName,
					title: menuOptions.label,
					deepMenu: [],
					namespace: (theExtension.attributes["data-namespace"]) ? theExtension.attributes["data-namespace"].value : null
				});
				if (theExtension.attributes["data-menu-title-short"]) extensions[extensionName].shortTitle = theExtension.attributes["data-menu-title-short"].value;
				const firstChild = document.querySelector(".menu-screen#"+extensionName+" .scroll-area").firstChild;
				firstChild.innerHTML = '<h1 class="large-title">'+$(".menu-screen#"+extensionName+" header h1").first().text()+'</h1>' + firstChild.innerHTML; 
								
				let deepMenus = document.querySelectorAll('.menu-screen[data-parent-extension="'+extensionName+'"]');
				for (let d of deepMenus) {
					extensions[extensionName].deepMenu.push(d.id);
				}
			} 
			if (!extensionPlaced) {
				unplacedExtensions.push({name: extensionName, kind: "extension"});
			}
		}
		
		// Add top-level menus, first from the navigation manifest and then all "left-overs".
		navigation = navigation.concat(unplacedExtensions);
		
		let navDestination = 0;
		if (document.querySelector(".beo-dynamic-menu.main-menu")) {
			navDestination = 1;
			mainMenuExtension = document.querySelector(".beo-dynamic-menu.main-menu").closest(".menu-screen").attributes.id.value;
		}
		if (navDestination == 0) {
			const navSpacer = document.createElement('div');
			navSpacer.className = "nav-spacer begin";
			document.querySelector('nav.bar .nav-content').appendChild(navSpacer);
		}
		// 0 = Menus go to the top navigation bar as before, 1 = menus go to the "main menu" space inside an extension. Top navigation bar is then populated with shortcuts.
		
		for (let n in navigation) {
			let isMainMenu
			if (navigation[n].kind == "extension") {
				if (customisations && 
					customisations.hiddenExtensions &&
					customisations.hiddenExtensions.indexOf(navigation[n].name) != -1) {
					continue; // Skip adding this extension if it's hidden.
				}
				let theExtension = document.querySelector(".menu-screen#"+navigation[n].name);
				if (theExtension) {
					isMainMenu = (navigation[n].name == mainMenuExtension) ? true : false; // Checks if this is the main menu. It will always appear in top bar.
					
					iconName = (theExtension.attributes["data-icon"]) ? theExtension.attributes["data-icon"].value : null;
					if (systemType == "hifiberry" && theExtension.attributes["data-icon-hifiberry"]) {
						iconName = theExtension.attributes["data-icon-hifiberry"].value;
					}
					let menuOptions = {
						onclick: 'beo.showExtension(\''+navigation[n].name+'\');',
						icon: extensions[navigation[n].name].assetPath+"/symbols-black/"+iconName,
						id: navigation[n].name+'-menu-item',
						data: {"data-extension-id": navigation[n].name},
						classes: ["nav-item"]
					};
					
					if (theExtension.attributes["data-menu-value-class"]) {
						menuOptions.valueClasses = [theExtension.attributes["data-menu-value-class"].value];
						menuOptions.value = "";
					}
					
					menuOptions.labelClasses = [""];
					if (theExtension.attributes["data-menu-title-class"]) {
						menuOptions.labelClasses = [theExtension.attributes["data-menu-title-class"].value];
					}
					menuOptions.label = theExtension.attributes["data-menu-title"].value;
					
					let hideExtension = false;
					if (theExtension.attributes["data-hidden"]) hideExtension = true;
					if (customisations && 
						customisations.hiddenExtensions &&
						customisations.hiddenExtensions.indexOf(navigation[n].name) != -1) {
						hideExtension = true; // Skip adding this extension if it's hidden.
					}
					if (!hideExtension) {
						if (navDestination == 0) {
							
							document.querySelector('nav.full .nav-content').appendChild(createElementFromHTML(createMenuItem(menuOptions)));
							const destinationNode = document.createElement('div');
							destinationNode.classList.add('nav-item', ...menuOptions.labelClasses);
							destinationNode.dataset.extensionId = menuOptions.data['data-extension-id'];
							destinationNode.addEventListener('click', function(e) {
								beo.showExtension(navigation[n].name);
							});
							destinationNode.innerText = menuOptions.label;
							document.querySelector('nav.bar .nav-content').appendChild(destinationNode);
						} else if (navDestination == 1 && !isMainMenu) {
							menuOptions.chevron = true;
							document.querySelector('.beo-dynamic-menu.main-menu').appendChild(createElementFromHTML(createMenuItem(menuOptions)));
						}
					}
					
					extensions[navigation[n].name] = Object.assign(extensions[navigation[n].name], {
						id: navigation[n].name, 
						icon: iconName,
						title: menuOptions.label,
						deepMenu: [],
						namespace: (theExtension.attributes["data-namespace"]) ? theExtension.attributes["data-namespace"].value : null
					});
					
					if (!isMainMenu && mainMenuExtension) extensions[navigation[n].name].parentMenu = mainMenuExtension;
					const extensionName = navigation[n].name;
					const firstChild = document.querySelector(".menu-screen#"+extensionName+" .scroll-area").firstChild;
					const text = document.querySelector(".menu-screen#"+extensionName+" header h1")?.firstChild.textContent;
					firstChild.innerHTML = '<h1 class="large-title">'+text+'</h1>' + firstChild.innerHTML; 
				}
			} else {
				if (navDestination == 0) {
					const hashr = document.createElement('hr');
					document.querySelector('nav.full .nav-content').appendChild(hashr);
					const navSeparator = document.createElement('div');
					navSeparator.classList.add('nav-separator');
					document.querySelector('nav.bar .nav-content').appendChild(navSeparator);
				} else if (navDestination == 1 && !isMainMenu) {
					const hashr = document.createElement('hr');
					document.querySelector('.beo-dynamic-menu.main-menu').appendChild(hashr);
				}
			}
		}
		
		if (navDestination == 1) {
			prepareFavourites();
		} else {
			const navSpacer = document.createElement('div');
			navSpacer.classList.add('nav-spacer', 'end');

			document.querySelector('nav.bar .nav-content').appendChild(navSpacer);
		}
		
		document.dispatchEvent(new CustomEvent('ui', {
			header: "menusReady",
		}));
		console.log("Menus ready.");
	}

	let favourites = [];
	function prepareFavourites(navSetID = null) {
		let selectableNavSets = 0;
		if (!navSetID) {
			if (localStorage.beocreateSelectedNavigationSet) {
				navSetID = localStorage.beocreateSelectedNavigationSet;
				let setFound = false;
				for (let i = 0; i < navigationSets.length; i++) {
					if (navigationSets[i].id == navSetID) {
						setFound = true;
						break;
					}
				}
				if (!setFound) navSetID = "full";
			} else {
				for (let i = 0; i < navigationSets.length; i++) {
					if (!navigationSets[i].hideFromShortcuts) {
						navSetID = navigationSets[i].id;
						break;
					}
				}
			}
		}
		
		let setName = "";
		for (let s in navigationSets) {
			if (navigationSets[s].id == navSetID) {
				if (s == 0) {
					favourites = navigation;
				} else {
					favourites = navigationSets[s].items;
				}
				try {
					setName = navigationSets[s].name;
				} catch (error) {
					if (s == 0) {
						setName = "Main Menu";
					} else {
						setName = "Shortcuts";
					}
				}
			}
		}
		
		document.querySelector('.nav-mode-name').innerText = setName;
		
		let previousKind = null;
		if (favourites[0].name && favourites[0].name != mainMenuExtension) {
			favourites.unshift({kind: "extension", name: mainMenuExtension}, {kind: "separator"});
		}
		const items = Array.from(document.querySelectorAll('nav.bar .nav-content, nav.full .nav-content'));
		for(const item of items) {
			item.innerHTML = "";
		}
		const navSpacerBegin = document.createElement('div');
		navSpacerBegin.className = "nav-spacer begin";

		document.querySelector('nav.bar .nav-content').appendChild(navSpacerBegin);

		for (let f in favourites) {
			if (favourites[f].kind == "extension") {
				if (customisations && 
					customisations.hiddenExtensions &&
					customisations.hiddenExtensions.indexOf(favourites[f].name) != -1) {
					continue; // Skip adding this extension if it's hidden.
				}
				const theExtension = document.querySelector(".menu-screen#"+favourites[f].name);
				const fav = favourites[f].name;
				if (theExtension && extensions[fav]) {
					let menuOptions = {
						onclick: 'beo.showExtension(\''+fav+'\');',
						icon: extensions[fav].assetPath+"/symbols-black/"+extensions[fav].icon,
						id: fav+'-menu-item',
						data: {"data-extension-id": fav},
						classes: ["nav-item"]
					};
					
					menuOptions.labelClasses = [""];
					if (theExtension.attributes["data-menu-title-class"]) {
						menuOptions.labelClasses = [theExtension.attributes["data-menu-title-class"].value];
					}
					menuOptions.label = theExtension.attributes["data-menu-title"].value;
					
					if (!theExtension.attributes["data-hidden"]) {
						document.querySelector('nav.full .nav-content').appendChild(createElementFromHTML(createMenuItem(menuOptions)));

						const navItem = document.createElement('div');
						navItem.className = "nav-item "+menuOptions.labelClasses.join(" ");
						navItem.dataset.extensionId = menuOptions.data['data-extension-id'];
						navItem.innerText = menuOptions.label;
						navItem.addEventListener('click', function(e) {
							beo.showExtension(fav);
						});

						document.querySelector('nav.bar .nav-content').appendChild(navItem);
					}

				}
				previousKind = "extension";
			} else {
				if (previousKind && previousKind != "separator") {
					document.querySelector('nav.full .nav-content').appendChild(document.createElement('hr'));
					const navSeparator = document.createElement('div');
					navSeparator.classList.add('nav-separator');
					document.querySelector('nav.bar .nav-content').appendChild(navSeparator);
				}
				previousKind = "separator";
			}
		}
		const navSpacerEnd = document.createElement('div');
		navSpacerEnd.classList.add('nav-spacer', 'end');
		document.querySelector('nav.bar .nav-content').appendChild(navSpacerEnd);
		
		for (let i = 0; i < navigationSets.length; i++) {
			if (!navigationSets[i].hideFromShortcuts) selectableNavSets++;
		}
		if (selectableNavSets > 1) {
			const navItems = Array.from(document.querySelectorAll('nav.bar, nav.full'));
			for(const item of navItems) {
				item.classList.add("show-mode-button");
			}
		}
	}

	function chooseNavigationMode(mode) {
		if (mode == undefined) {
			let navSetID;
			document.querySelector('#navigation-mode-list').innerHTML = "";
			if (localStorage.beocreateSelectedNavigationSet) {
				navSetID = localStorage.beocreateSelectedNavigationSet;
			} else {
				for (let i = 0; i < navigationSets.length; i++) {
					if (!navigationSets[i].hideFromShortcuts) {
						navSetID = i;
						break;
					}
				}
			}
			for (let i = 0; i < navigationSets.length; i++) {
				if (!navigationSets[i].hideFromShortcuts) {
					let setName;
					let setDescription = "";
					if (i == 0 && !navigationSets[0].name) {
						setName = "Main Menu";
						if (!navigationSets[i].description) setDescription = "Include all main menu items";
					} else {
						try {
							setName = navigationSets[i].name;
						} catch (error) {
							setName = "Shortcuts";
						}
						if (navigationSets[i].description) setDescription = navigationSets[i].description;
					}
					document.querySelector('#navigation-mode-list').appendChild(createElementFromHTML(createMenuItem({
						label: setName,
						description: setDescription,
						onclick: 'beo.chooseNavigationMode(\''+navigationSets[i].id+'\');',
						checkmark: "left",
						checked: (navigationSets[i].id == navSetID)
					})));
				}
			}
			ask("navigation-mode-menu");
		} else {
			ask();
			localStorage.beocreateSelectedNavigationSet = mode;
			prepareFavourites(mode);
			showSelectedNavItem();
			document.dispatchEvent(new CustomEvent('ui', {
				header: 'navigationChanged',
			}));
		}
	}

	let configuredTabs = [];

	function prepareTabBar() {
		// Load custom tabs if set, or load default tabs.
		if (localStorage.beoConfiguredTabs) {
			configuredTabs = JSON.parse(localStorage.beoConfiguredTabs);
		} else {
			let tabIndex = 0;

			$("nav.full .menu-item").each(function() {
				if (tabIndex < 4) {
					configuredTabs.push($(this).attr("data-extension-id"));
					tabIndex++;
				}
			});
		}
	}


	let interfaceMode = 2; // 1 = normal, 2 = compact

	window.matchMedia("(max-width: 620px)").addListener(e => e.matches && updateInterfaceMode(2));
	window.matchMedia("(min-width: 621px)").addListener(e => e.matches && updateInterfaceMode(1));
	function updateInterfaceMode(mode = null) {
		//breakpoint = 620;
		if (mode == null) {
			mode = (window.matchMedia("(max-width: 620px)").matches) ? 2 : 1;
		}
		if (mode == 2) {
			// Change to compact mode.
			// Move main tabs from the "sidebar" to the top.
			$('.tabs-container.move').each(function(index){
				if ($(this).parent().is("header")) {
					$(this).parents(".menu-screen").find(".tab-placeholder").replaceWith($(this).detach());
				}
			});
			interfaceMode = 2;
		} else if (mode == 1) {
			// Change to normal mode.
			// Move main tabs from the top to the "sidebar".
			if (mainMenuVisible) toggleMainMenu();
			interfaceMode = 1;
			$('.tabs-container.move').each(function(index){
				if (!$(this).parent().is("header")) {
					$(this).after('<div class="tab-placeholder"></div>');
					$(this).parents(".menu-screen").find("header h1").first().after($(this).detach());
				}
			});
		}
	}


	window.matchMedia("(prefers-color-scheme: dark)").addListener(e => e.matches && setAppearance(true));
	window.matchMedia("(prefers-color-scheme: light)").addListener(e => e.matches && setAppearance(false));

	function setAppearance(isDark, savePreference) {
		let dark;
		if (savePreference) {
			if (isDark == undefined) localStorage.beocreateAppearance = "auto";
			if (isDark == true) localStorage.beocreateAppearance = "dark";
			if (isDark == false) localStorage.beocreateAppearance = "light";
		}
		$(".ui-appearance-mode .menu-item").removeClass("checked");
		if (localStorage.beocreateAppearance) {
			if (localStorage.beocreateAppearance == "dark") {
				isDark = true;
				$(".ui-appearance-mode .menu-item#ui-appearance-dark").addClass("checked");
			}
			if (localStorage.beocreateAppearance == "light") {
				isDark = false;
				$(".ui-appearance-mode .menu-item#ui-appearance-light").addClass("checked");
			}
			if (localStorage.beocreateAppearance == "auto") {
				$(".ui-appearance-mode .menu-item#ui-appearance-auto").addClass("checked");
			}
		} else {
			$(".ui-appearance-mode .menu-item#ui-appearance-auto").addClass("checked");
		}
		if (isDark == undefined) {
			dark = false;
			dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		} else {
			dark = isDark;
		}
		if (dark == true) {
			console.log("Setting appearance to dark.");
			$("body").addClass("dark");
			darkAppearance = true;
		} else if (dark == false) {
			console.log("Setting appearance to light.");
			$("body").removeClass("dark");
			darkAppearance = false;
		}
		
	}

	function setSymbol(element, symbolPath) {
		$(element).css("-webkit-mask-image", "url("+symbolPath+")").css("mask-image", "url("+symbolPath+")");
	}

	let mainMenuVisible = false;
	function toggleMainMenu() {
		// Expands full navigation when the interface is in "compact" layout
		if (mainMenuVisible == false) {
			clearTimeout(mainMenuVisible);
			$("nav.full, #nav-back-plate").addClass("block");
			setTimeout(function() {
				$("nav.full, #nav-back-plate").addClass("visible");
				$("#extensions").addClass("shifted");
			}, 20);
			mainMenuVisible = true;
		} else {
			$("nav.full, #nav-back-plate").removeClass("visible");
			$("#extensions").removeClass("shifted");
			mainMenuVisible = setTimeout(function() {
				$("nav.full, #nav-back-plate").removeClass("block");
				mainMenuVisible = false;
			}, 500);
		}
		
	}

	let immediateParentMenu = null;
	let topParentMenu = null;
	let menuState = {};
	let navigating = false;
	let extensionAnimations = 0;

	function showExtension(extension, direction = null, fromBackButton = false, invisibly = false, fromNavBar = false) {
		if (navigating) console.error("Navigation is already in progress.");
		
		let newExtension;
		if (isNaN(extension)) { // Selecting tab with name (from a menu item).
			newExtension = extension;
		} else { // Selecting tab with index number (from favourites bar).
			newExtension = configuredTabs[extension];
		}
		
		if (!navigating && extensions[newExtension] && newExtension != selectedExtension) {
			let navigating = true;
			let oldExtension = selectedExtension;
			
			let backTarget = null;
			let backTitle = null;
			let fromDeepMenu = false;
			let extensionToActivate = null;
			
			let animateInMenu = null;
			let animateInDirection = null;
			let animateOutMenu = null;
			let animateOutDirection = null;
			let showMenu = null;
			let hideMenu = null;
			
			let selectedDeepMenu;
			let newDeepMenu;

			if (deepMenuState[oldExtension] && deepMenuState[oldExtension].length > 0) {
				// Check if currently selected extension has a deep menu open.
				selectedDeepMenu = deepMenuState[oldExtension][deepMenuState[oldExtension].length-1];
			} else {
				selectedDeepMenu = null;
			}
			if (deepMenuState[newExtension] && deepMenuState[newExtension].length > 0) {
				// Check if the new extension has a deep menu open.
				newDeepMenu = deepMenuState[newExtension][deepMenuState[newExtension].length-1];
			} else {
				newDeepMenu = null;
			}
			
			if (topParentMenu) $('nav .nav-item[data-extension-id="'+topParentMenu+'"]').removeClass("selected");
			
			
			if (oldExtension == newExtension) {
				// New extension is the previously selected extension. Animate out deep menus, if any.
				if (selectedDeepMenu) {
					showDeepMenu(oldExtension, oldExtension);
				}
			} else {
				// Not the same extension.
				if (!extensions[newExtension].parentMenu) {
					// Top level menu.
					if (topParentMenu != newExtension) {
						if (selectedDeepMenu) {
							hideMenu = selectedDeepMenu;
						} else {
							hideMenu = oldExtension;
						}
						if (newDeepMenu) {
							showMenu = newDeepMenu;
						} else {
							showMenu = newExtension;
						}
					} else {
						// The new extension is the parent menu, close submenus.
						if (selectedDeepMenu) {
							showDeepMenu(oldExtension, oldExtension, true);
						} else {
							animateOutMenu = oldExtension;
							animateOutDirection = "right";
						}
						animateInMenu = newExtension;
						animateInDirection = "right";
						let nextLevel = false;
						// Clear menu states for this stack.
						if (menuState[newExtension] && menuState[newExtension].submenu) {
							nextLevel = menuState[newExtension].submenu;
						} else if (menuState[oldExtension] && menuState[oldExtension].submenu) {
							nextLevel = menuState[oldExtension].submenu;
						}

						while (nextLevel) {
							menuState[nextLevel] = {};
							if (menuState[nextLevel] &&
								menuState[nextLevel].submenu) {
								nextLevel = menuState[nextLevel].submenu;
							} else {
								nextLevel = false;
							}
						}
					}
					topParentMenu = newExtension;
					immediateParentMenu = newExtension;
				} else {
					// Submenu.
					// Determine new parent menu.
					let previousLevel = extensions[newExtension].parentMenu;
					immediateParentMenu = previousLevel;
					while (previousLevel) {
						if (extensions[previousLevel].parentMenu) {
							previousLevel = extensions[previousLevel].parentMenu;
						} else {
							topParentMenu = previousLevel;
							previousLevel = false;
						}
					}
					
					if (extensions[newExtension].parentMenu == oldExtension) {
						// New extension is a submenu of the current extension. Animate in the new extension.
						animateOutMenu = oldExtension;
						animateInMenu = newExtension;
						animateInDirection = "left";
						animateOutDirection = "left";
						if (!menuState[oldExtension]) menuState[oldExtension] = {};
						menuState[oldExtension].submenu = newExtension;
					} else {
						// New extension is not a submenu of the current extension.
						
						if (oldExtension &&
							extensions[oldExtension].parentMenu && 
							newExtension == extensions[oldExtension].parentMenu) {
							// New extension is one level up.
							if (selectedDeepMenu) {
								showDeepMenu(oldExtension, oldExtension, true);
							} else {
								animateOutMenu = oldExtension;
							}
							animateInMenu = newExtension;
							animateInDirection = "right";
							animateOutDirection = "right";
							menuState[newExtension] = {};
							
						} else {
							// New extension is somewhere else, just show it.
							
							if (menuState[newExtension] && menuState[newExtension].submenu) {
								showMenu = menuState[newExtension].submenu;
								extensionToActivate = menuState[newExtension].submenu;
							} else {
								showMenu = newExtension;
							}
							
							if (deepMenuState[showMenu] && deepMenuState[showMenu].length > 0) {
								// Check if the new extension has a deep menu open.
								showMenu = deepMenuState[showMenu][deepMenuState[showMenu].length-1];
							}
							
							if (selectedDeepMenu) {
								hideMenu = selectedDeepMenu;
							} else {
								hideMenu = oldExtension;
							}
							if (!menuState[extensions[newExtension].parentMenu]) menuState[extensions[newExtension].parentMenu] = {};
							menuState[extensions[newExtension].parentMenu].submenu = newExtension;
							immediateParentMenu = extensions[newExtension].parentMenu;
						}
					}
					backTarget = immediateParentMenu;
					if (extensions[immediateParentMenu].shortTitle) {
						backTitle = extensions[immediateParentMenu].shortTitle;
					} else {
						backTitle = extensions[immediateParentMenu].title;
					}
					
				}
			}
			
			if (direction) {
				animateInDirection = (direction == "left") ? "left" : "right";
				animateOutDirection = animateInDirection;
				animateInMenu = newExtension;
				animateOutMenu = (oldExtension) ? oldExtension : null;
				hideMenu = null;
				showMenu = null;
			}
			
			//console.log(hideMenu, showMenu, animateOutMenu, animateInMenu, animateOutDirection, animateInDirection, extensionToActivate, newExtension);
			
			if (invisibly) {
				hideMenu = animateOutMenu;
			}
			if (!invisibly) {
				// Perform menu animations.
				if (animateInMenu && animateInDirection) {
					extensionAnimations++;
					let hiddenDirection = (animateInDirection == "left") ? "right" : "left";
					document.querySelector(".menu-screen#"+animateInMenu).classList.add("block", "new", "hidden-"+hiddenDirection);
					document.querySelector(".menu-screen#"+animateInMenu).classList.remove("hidden-"+animateInDirection);
					setTimeout(function() {
						document.querySelector(".menu-screen#"+animateInMenu).classList.remove("hidden-"+hiddenDirection);
					}, 50);
					setTimeout(function() {
						document.querySelector(".menu-screen#"+animateInMenu).classList.remove("new");
						extensionAnimations--;
						if (extensionAnimations <= 0) {
							navigating = false;
							extensionAnimations = 0;
						}
					}, 600);
				}
				if (showMenu) {
					document.querySelector(".menu-screen#"+showMenu).classList.remove("hidden-left", "hidden-right");
					document.querySelector(".menu-screen#"+showMenu).classList.add("block");
				}
				if (animateOutMenu && animateOutDirection) {
					extensionAnimations++;
					document.querySelector(".menu-screen#"+animateOutMenu).classList.add("hidden-"+animateOutDirection);
					setTimeout(function() {
						document.querySelector(".menu-screen#"+animateOutMenu).classList.remove("block");
						extensionAnimations--;
						if (extensionAnimations <= 0) {
							navigating = false;
							extensionAnimations = 0;
						}
					}, 600);
				}
			}
			if (hideMenu) {
				document.querySelector(".menu-screen#"+hideMenu).classList.remove("block");
			}
			if (extensionAnimations <= 0) {
				navigating = false;
			}
			
			if (selectedExtension && direction) { // Custom flow for the back button.
				if (extensions[selectedExtension].shortTitle) {
					backTitle = extensions[selectedExtension].shortTitle;
				} else {
					backTitle = extensions[selectedExtension].title;
				}
				backTarget = selectedExtension;
			}
			try {
				if (backTarget) {
					if (!(fromBackButton && direction)) {
						document.querySelector("#"+newExtension+" .back-button.master").classList.add("visible");
						document.querySelector("#"+newExtension+" .back-button.master").setAttribute("data-back-text", backTitle);
						document.querySelector("#"+newExtension+" .back-button.master").setAttribute("data-back-target", backTarget);
					}
				} else {
					document.querySelector("#"+newExtension+" .back-button.master").classList.remove("visible");
				}
			} catch (error) {
				// No back button.
			}
			
			// Set the back button to traverse the custom flow instead of menu hierarchy, if direction specified.
			try {
				if (direction) {
					if (!fromBackButton) {
						direction == "left" ? backDirection = "right" : backDirection = "left";
						document.querySelector("#"+newExtension+" .back-button.master").setAttribute("data-back-direction", backDirection);
					}
				} else if (!fromBackButton) {
					document.querySelector("#"+newExtension+" .back-button.master").removeAttribute("data-back-direction");
				}
			} catch (error) {
				// No back button.
			}
			
			activatedExtension(((extensionToActivate) ? extensionToActivate : newExtension), invisibly);
			
			// Manage selected navigation/favourites item.
			
			
			if (interfaceMode == 2 && mainMenuVisible && !invisibly) toggleMainMenu();
		} else if (newExtension == selectedExtension) {
			if (deepMenuState[selectedExtension] && deepMenuState[selectedExtension].length > 0) {
				showDeepMenu(selectedExtension, selectedExtension);
			}
		}
		
	}


	function showExtensionWithHistory(extensionHistory, extension) {
		// The function will construct the back-button history up until the "extension to select minus one" – for the last step, the function will call "showExtension".
		// extensionHistory: the path from left to right as an array.
		// extension: the extension to select. The history will be constructed only up until this extension.
		if (extensionHistory[0] != extension) {
			console.log("First extension to show is not '"+extension+"', constructing history…");
			for (let i = 0; i < extensionHistory.length; i++) {
				if (extensionHistory[i] == extension) {
					console.log("History constructed, now showing '"+extensionHistory[i]+"' normally…");
					showExtension(extensionHistory[i], "left", false);
					break;
				} else {
					console.log("Showing '"+extensionHistory[i]+"' invisibly to construct history…");
					showExtension(extensionHistory[i], "left", false, true);
				}
			}
		} else {
			// Just select the extension, no need to reconstruct history.
			console.log("History construction not necessary, showing '"+extension+"' normally…");
			showExtension(extension);
		}
		historyConstructed = true;
	}

	let deepMenuState = {};
	let deepNavigating = false;
	function showDeepMenu(menuID, overrideWithExtension, hideNew) {
		if (!deepNavigating) {
			deepNavigating = true;
			let extension;
			if (overrideWithExtension) {
				extension = overrideWithExtension;
			} else {
				try {
					extension = document.querySelector(".menu-screen#"+menuID).attributes["data-parent-extension"].value;
				} catch (error) {
					if (extensions[menuID]) {
						extension = menuID;
					} else {
						extension = null;
					}
				}
			}
			// First make sure the extension containing this deep menu is selected.
			if (extension) {
				if (selectedExtension != extension) showExtension(extension);
			} else {
				for (let ext in extensions) {
					if (extensions[ext].deepMenu.indexOf(menuID) != -1) {
						showExtension(ext);
						break;
					}
				}
			}
			let newMenu = menuID;
			let back = false;
			let oldMenu;

			if (!deepMenuState[extension]) deepMenuState[extension] = [];
			if (deepMenuState[extension].length == 0) {
				// This extension currently has no deep menus open.
				oldMenu = extension;
				deepMenuState[extension] = [newMenu];
			} else {
				newMenuIndex = deepMenuState[extension].indexOf(newMenu); // Check if the new menu is in the deep menu hierarachy.
				oldMenu = deepMenuState[extension][deepMenuState[extension].length-1];
				if (newMenu == extension) {
					deepMenuState[extension] = [];
					back = true;
				} else if (deepMenuState[extension].length == 1 && newMenu == extension) { // Returning to the main menu of the extension.
					deepMenuState[extension] = [];
					back = true;
				} else {
					if (newMenuIndex == -1) { // Going forwards.
						deepMenuState[extension].push(newMenu);
					} else { // Going backwards.
						deepMenuState[extension].length = newMenuIndex+1;
						back = true;
					}
				}
			}
			if (oldMenu != newMenu) {
				if (!navigating) activatedExtension(selectedExtension);
				if (back) {
					if (!hideNew) {
						$("#" + newMenu).addClass("hidden-left").removeClass("hidden-right");
					} else {
						$("#" + newMenu).addClass("hidden-right").removeClass("hidden-left");
					}
				} else {
					if (!hideNew) $("#" + newMenu).addClass("hidden-right").removeClass("hidden-left");
				}
				if (!hideNew) $("#" + newMenu).addClass("block new");
				setTimeout(function() {
					if (!hideNew) $("#" + newMenu).removeClass("hidden-right hidden-left");
					if (back) {
						$("#" + oldMenu).addClass("hidden-right");
					} else {
						$("#" + oldMenu).addClass("hidden-left");
						if (!hideNew) $("#" + newMenu).attr("data-edge-swipe-previous-deep", oldMenu);
					}
				}, 50);
				setTimeout(function() {
					$("#" + oldMenu).removeClass("block");
					if (!overrideWithExtension) $("#" + newMenu).removeClass("new");
					deepNavigating = false;
				}, 600);
				if ($("#"+oldMenu).attr("data-menu-title-short")) {
					backTitle = $("#"+oldMenu).attr("data-menu-title-short");
				} else {
					backTitle = $("#"+oldMenu).attr("data-menu-title");
				}
				if (!back && !hideNew) {
					$("#"+newMenu+" .back-button.master").addClass("visible");
					$("#"+newMenu+" .back-button.master").attr("data-back-text", backTitle).attr("data-back-target-deep", oldMenu);
				}
			} else {
				deepNavigating = false;
			}
		}
	}

	function setMenuTitle(forMenu, title) {
		$("#"+forMenu).attr("data-menu-title", title);
		$("#"+forMenu+" > header h1, #"+forMenu+" h1.large-title").text(title);
	}


	$(document).on("click", ".back-button.master", function() {
		if ($(this).attr("data-back-target-deep")) {
			showDeepMenu($(this).attr("data-back-target-deep"));
		} else if ($(this).attr("data-back-target")) {
			backDirection = false;
			if ($(this).attr("data-back-direction")) backDirection = $(this).attr("data-back-direction");
			showExtension($(this).attr("data-back-target"), backDirection, true);
		}
	});



	function activatedExtension(extensionID, invisibly = false) {
		// Trigger the same event in both the UI and on the product.
		selectedExtension = extensionID;
		if (!invisibly) {
			setTimeout(function() {
				updateSliderWidths();
			}, 20);
			let deepMenu;
			if (deepMenuState[selectedExtension] && deepMenuState[selectedExtension].length > 0) {
				deepMenu = deepMenuState[selectedExtension][deepMenuState[selectedExtension].length-1];
			} else {
				deepMenu = null;
			}
			$(document).trigger("general", {header: "activatedExtension", content: {extension: extensionID, deepMenu: deepMenu}});
			beoCom.sendToProduct("general", "activatedExtension", {extension: extensionID, deepMenu: deepMenu});
			sendToProductView(extensionID);
			
			// Save state, so that the UI returns to the same menu when reloaded.
			localStorage.beoCreateSelectedExtension = extensionID;
		}
		
		showSelectedNavItem();
	}

	function showSelectedNavItem() {
		$('nav .nav-item.selected').removeClass("selected");
			
		try {
			// Start with current extension and go backwards until a parent menu is found, select that.
			let ext = selectedExtension;
			let navItems;
			while (ext) {
				navItems = document.querySelectorAll('nav .nav-item[data-extension-id="'+ext+'"]');
				if (!navItems.length && extensions[ext].parentMenu) {
					ext = extensions[ext].parentMenu;
				} else {
					ext = false;
				}
			}
			if (navItems.length) {
				for (let ni in navItems) {
					navItems[ni].classList.add("selected");
				}
			}
		} catch (error) {
			// Navigation item does not exist.
		}
	}



	function restoreState(theMenu) {
		// Triggered by the setup extension when the websocket connection is established.
		if (!stateRestored) {
			if (!theMenu) theMenu = null;
			if (theMenu == null && localStorage.beoCreateSelectedExtension != undefined) {
				theMenu = localStorage.beoCreateSelectedExtension;
			}
			if (!extensions[theMenu]) theMenu = $(".menu-screen").first().attr("id");
			if (window.location.hash && extensions[window.location.hash.substring(1)]) {
				// The URL hash can be used to open a specific extension.
				if (window.location.hash == "#now-playing") {
					// Now Playing is a special case, because it opens on top of other extensions.
					showExtension(theMenu);
					if (now_playing && now_playing.showNowPlaying) now_playing.showNowPlaying();
				} else {
					showExtension(window.location.hash.substring(1));
				}
			} else {
				showExtension(theMenu);
			}
			beoCom.send({target: "ui", header: "getUISettings"});
			stateRestored = true;
		} else {
			// If state has already been restored (i.e. this is a reconnection), only indicate the currently selected extension to the product.
			activatedExtension(selectedExtension);
		}
	}

	$(document).on("ui", function(event, data) {
		if (data && data.header == "settings") {
			if (data.content.settings) {
				uiSettings = data.content.settings;
				if (uiSettings.disclosure) {
					for (element in uiSettings.disclosure) {
						if ($('.disclosure[data-disclosure="'+element+'"]').length > 0) {
							disclosure(element, uiSettings.disclosure[element]);
						}
					}
				}
			}
		}
	});

	// GENERATE MENU ITEMS
	function createMenuItem(options) {
		// Assembles menu item markup from input, ensuring consistency.
		let menuItem = '<div class="menu-item ';
		
		if (!options.classes) options.classes = [];
		if (options.icon) options.classes.push("icon");
		if (options.large) options.classes.push("large");
		if (options.chevron) options.classes.push("chevron");
		if (options.disabled) options.classes.push("disabled");
		if (options.checked) options.classes.push("checked");
		if (options.static) options.classes.push("static");
		if (options.toggle != undefined) options.classes.push("toggle");
		if (options.toggle) options.classes.push("on");
		if (options.twoRows || options.description || options.customMarkup) options.classes.push("two-rows");
		
		if (options.checkmark) {
			options.classes.push("checkmark", options.checkmark);
			if (options.checkmark == "left") {
				if (options.classes.indexOf("icon") == -1) options.classes.push("icon");
				options.icon = "common/symbols-black/checkmark.svg";
			}
		}
		
		// Custom classes
		if (options.classes) {
			menuItem += options.classes.join(" ");
		}
		menuItem += '"'; // Close classes
		
		// ID
		if (options.id) {
			menuItem += ' id="'+options.id+'"';
		}
		
		// Data items
		if (options.data) {
			for (property in options.data) {
				menuItem += ' '+property+'="'+options.data[property]+'"';
			}
		}
		
		// Action
		if (options.onclick) {
			menuItem += ' onclick="'+options.onclick+'"';
		}
		
		//menuItem += '><div class="one-row">';
		menuItem += '>\n';
		if (options.twoRows || options.description || options.customMarkup) menuItem += '<div class="first-row">\n';
		
		// Icon
		if (options.icon) {
			//menuItem += '<img class="menu-icon" src="'+options.icon+'">\n';
			menuItem += '<div class="menu-icon left" style="-webkit-mask-image: url('+options.icon+'); mask-image: url('+options.icon+');"></div>\n';
		}
		
		menuItem += '<div class="menu-text-wrap">\n';
		
		// Label
		menuItem += '<div class="menu-label';
		if (options.labelClasses != undefined) {
			for (var i = 0; i < options.labelClasses.length; i++) {
				menuItem += ' '+options.labelClasses[i];
			}
		}
		menuItem += '"';
		if (options.translation && options.translation.label) {
			menuItem += ' data-localisation="'+options.translation.label+'"'
		}
		menuItem += '>'+options.label+'</div>\n';
		
		
		//menuItem += '</div>'; // close one-row
		
		// Value
		if (options.value != undefined) {
			menuItem += '<div class="menu-value';
			if (options.valueClasses) {
				for (var i = 0; i < options.valueClasses.length; i++) {
					menuItem += ' '+options.valueClasses[i];
				}
			}
			if (options.valueAsButton) menuItem += ' button';
			if (options.valueAsBadge) menuItem += ' badge';
			menuItem += '"';
			if (options.translation && options.translation.value) {
				menuItem += ' data-localisation="'+options.translation.value+'"'
			}
			menuItem += '>'+options.value+'</div>\n';
		}
		
		menuItem += '</div>\n'; // close text-wrap
		
		// Icon, right
		if (options.iconRight) {
			//menuItem += '<img class="menu-icon right" src="'+options.iconRight+'">\n';
			menuItem += '<div class="menu-icon right" style="-webkit-mask-image: url('+options.iconRight+'); mask-image: url('+options.iconRight+');"></div>\n';
		}
		
		// Toggle
		if (options.toggle != undefined) {
			menuItem += '<div class="menu-toggle"></div>\n';
		}
		
		if (options.twoRows || options.description || options.customMarkup) menuItem += '</div>\n'; // close first-row
		
		
		// Description or custom markup (choose one)
		if (options.description) {
			menuItem += '<div class="menu-custom-markup"><p>'+options.description+'</p></div>';
		} else if (options.customMarkup) {
			menuItem += '<div class="menu-custom-markup">'+options.customMarkup+'</div">';
		}
		
		
		menuItem += '</div>\n';
		
		if (options.attachment) {
			menuItem += '<div class="menu-attachment';
			if (options.icon) menuItem += ' icon-margin';
			menuItem += '"';
			if (options.id) menuItem += ' id="'+options.id+'-attachment"';
			menuItem += '>'+options.attachment+'</div>\n';
		}

		return menuItem;
	}
	function createElementFromHTML(htmlString) {
		const div = document.createElement('div');
		div.innerHTML = htmlString.trim();

		return div.firstChild;
	}
	function createCollectionItem(options) {
		// Assembles collection item markup from input, ensuring consistency.
		let collectionItem = '<div class="collection-item ';
		
		if (!options.classes) options.classes = [];
		if (options.disabled) options.classes.push("disabled");
		if (options.checked) options.classes.push("checked");
		if (options.static) options.classes.push("static");
		if (options.checkmark) options.classes.push("checkmark");
		if (options.overlay) options.classes.push("overlay");
		if (options.onclickSecondary && options.secondarySymbol) options.classes.push("secondary-action");
		
		// Custom classes
		if (options.classes) {
			collectionItem += options.classes.join(" ");
		}
		collectionItem += '"'; // Close classes
		
		// ID
		if (options.id) {
			collectionItem += ' id="'+options.id+'"';
		}
		
		// Data items
		if (options.data) {
			for (property in options.data) {
				collectionItem += ' '+property+'="'+options.data[property]+'"';
			}
		}
		
		
		collectionItem += '>\n';
		
		// Secondary action
		if (options.onclickSecondary && options.secondarySymbol) {
			
			collectionItem += '<div class="button symbol collection-item-secondary-symbol" onclick="'+options.onclickSecondary+'" style="-webkit-mask-image: url('+options.secondarySymbol+'); mask-image: url('+options.secondarySymbol+');"></div>';
		}
		
		// Square helper allows the collection item to maintain aspect ratio
		collectionItem += '<img class="square-helper" src="common/square-helper.png">\n<div class="collection-item-content"';
		
		// Action
		if (options.onclick) {
			collectionItem += ' onclick="'+options.onclick+'"';
		}
		
		collectionItem += '>\n';
		
		//if (options.icon) collectionItem += '<img class="collection-icon" src="'+options.icon+'">\n';
		iconSize = (options.iconSize) ? options.iconSize : "";
		if (options.icon) collectionItem += '<img class="collection-icon '+iconSize+'" src="common/square-helper.png" style="background-image: url('+options.icon+');">\n';
		
		if (options.labelUpper || options.label) {
			collectionItem += '<div class="collection-item-text">\n';
			
			if (options.labelUpper) collectionItem += '<div class="collection-label upper">'+options.labelUpper+'</div>\n';
			if (options.label) collectionItem += '<div class="collection-label lower">'+options.label+'</div>\n';
			
			collectionItem += '</div>\n';
		}
		
		collectionItem += '</div>\n'; // close collection content
		
		collectionItem += '</div>\n';
			
		
		return collectionItem;
	}



	// MANAGE LARGE/SMALL HEADER

	document.addEventListener("scroll", function(event) {
		if (event.target != document) {
			try {
				let targetScreen = event.target.parentNode;
				if (targetScreen.classList.contains("large-title") ||
					targetScreen.classList.contains("setup-large-title")) {
					if (targetScreen.querySelector(".scroll-area").scrollTop > 45) {
						targetScreen.querySelector("header").classList.add("compact");
					} else {
						targetScreen.querySelector("header").classList.remove("compact");
					}
				}
				if (targetScreen.querySelector("header").classList.contains("opaque-scroll")) {
					if (targetScreen.querySelector("header").attributes["data-opaque-threshold"]) { // Allow specifying custom threshold after which header becomes opaque.
						threshold = targetScreen.querySelector("header").attributes["data-opaque-threshold"].value;
					} else {
						threshold = 50;
					}
					if (targetScreen.querySelector(".scroll-area").scrollTop > threshold) {
						targetScreen.querySelector("header").classList.add("opaque");
					} else {
						targetScreen.querySelector("header").classList.remove("opaque");
					}
				}
			} catch (error) {
				// No header for this element, probably.
			}
		}
		//console.log(event.offsetParent);
	}, true);


	// NOTIFICATION

	let notificationTimeout;
	let notificationAnimationTimeout;
	let currentNotificationID = false;
	let notificationIcon = "";
	let attentionIcon = new Image();

	function notify(options, dismissWithID = currentNotificationID) { // Display a standard HUD notification
		
		/* Possible options:
		no options = dismiss notification.
		
		id (notification ID)
		title
		message
		buttonAction
		buttonTitle
		icon ("attention" for animated B&O logo)
		timeout (seconds, false for persistent, nothing for default (3s))
		
		dismissWithID: if a notification with ID is being displayed, it can be only dismissed if the matching ID is supplied.
		*/
		if (!options) {
			if (!currentNotificationID || (dismissWithID && dismissWithID == currentNotificationID)) {
				$(".hud-notification").removeClass("visible");
				$("body").removeClass("notification");
				clearTimeout(notificationTimeout);
				notificationAnimationTimeout = setTimeout(function() {
					$(".hud-notification").removeClass("show");
				}, 500);
				currentNotificationID = false;
			}
		} else {
			clearTimeout(notificationAnimationTimeout);
			clearTimeout(notificationTimeout);
			
			if (options.id) {
				currentNotificationID = options.id;
			} else {
				currentNotificationID = false;
			}
			
			if (options.title) $(".hud-notification h1").text(options.title);
			
			if (options.message) {
				$(".hud-notification p").text(options.message);
			} else {
				$(".hud-notification p").text("");
			}
			
			if (options.buttonAction) {
				if (options.buttonTitle) $(".hud-notification .button").text(options.buttonTitle);
				if (options.buttonAction == "close") {
					$(".hud-notification .button").attr("onclick", "beo.notify(undefined);");
				} else {
					$(".hud-notification .button").attr("onclick", options.buttonAction);
				}
				$(".hud-notification .button").removeClass("hidden");
			} else {
				$(".hud-notification .button").addClass("hidden");
			}
			
			let icon;
			if (!options.icon) {
				icon = "common/symbols-black/notification.svg";
				$("#hud-notification-icon").removeClass("beo-load").addClass("hidden");
				notificationIcon = "";
			} else if (options.icon == "attention") {
				if (notificationIcon != "attention") {
					
					icon = attentionIcon.src;
					$("#hud-notification-icon").addClass("beo-load");
			
					$("#hud-notification-icon").removeClass("hidden");
					$("#hud-notification-icon").css("-webkit-mask-image", "url("+icon+")");
					notificationIcon = "attention";
				}
			} else {
				icon = options.icon;
				$("#hud-notification-icon").removeClass("beo-load hidden");
				$("#hud-notification-icon").css("-webkit-mask-image", "url("+icon+")");
				notificationIcon = icon;
			}
			
			if (options.progress == undefined) {
				$("#hud-progress").addClass("hidden");
			} else {
				$("#hud-progress").removeClass("hidden");
				$("#hud-progress-fill").css("width", options.progress+"%");
			}
			
			let timeout;
			if (options.timeout == undefined) {
				timeout = 3000;
			} else {
				if (options.timeout == false) {
					timeout = false;
				} else {
					timeout = options.timeout*1000;
				}
			}
			
			$(".hud-notification").addClass("show");
			$("body").addClass("notification");
			notificationAnimationTimeout = setTimeout(function() {
				$(".hud-notification").addClass("visible");
			}, 50);
			
			if (timeout) {
				notificationTimeout = setTimeout(function() {
					notify(undefined, currentNotificationID);
				}, timeout);
			} else {
				// Notification stays on screen.
			}
		}
	}




	// TABS WITHIN ELEMENTS (not the "favourites" at the bottom in compact layouts)

	$(document).on("click", ".tabs div", function() {
		if ($(this).attr("data-select-tab")) {
			showMenuTab($(this).attr("data-select-tab"));
		}
	});

	function showMenuTab(tabID, noCallback = false) {
		$(".tabs div[data-select-tab="+tabID+"]").siblings().removeClass("selected");
		$(".tabs div[data-select-tab="+tabID+"]").addClass("selected");
		$(".tab[data-tab-id="+tabID+"]").siblings(".tab").removeClass("visible");
		$(".tab[data-tab-id="+tabID+"]").addClass("visible");
		if ($(".tabs div[data-select-tab="+tabID+"]").attr("data-tab-callback") && !noCallback) {
			if (functionExists($(".tabs div[data-select-tab="+tabID+"]").attr("data-tab-callback"))) {
				executeFunction($(".tabs div[data-select-tab="+tabID+"]").attr("data-tab-callback"), [tabID]);
			} else {
				console.error("Function '"+$(".tabs div[data-select-tab="+tabID+"]").attr("data-tab-callback")+"', triggered by tab change, doesn't exist.");
			}
		}
		updateSliderWidths(); // For some reason, changing tabs affects the appearance of the balance slider.
	}



	// DISCLOSURE

	$(document).on("click", ".disclosure", function() {
		if ($(this).attr("data-disclosure")) {
			let element = $(this).attr("data-disclosure");
			let isOn;
			if ($(this).hasClass("on")) {
				//$(this).removeClass("on");
				disclosure(element, false);
				//$(element).addClass("hidden");
				isOn = false;
			} else {
				//$(this).addClass("on");
				disclosure(element, true);
				//$(element).removeClass("hidden");
				isOn = true;
			}
			if (!$(this).attr("data-disclosure-volatile")) {
				beoCom.send({target: "ui", header: "disclosure", content: {element: element, isOn: isOn}});
			}
		}
	});

	function disclosure(element, isOn) {
		if (isOn != undefined) {
			if (isOn) {
				$('.disclosure[data-disclosure="'+element+'"]').addClass("on");
				$(element).removeClass("hidden");
			} else {
				$('.disclosure[data-disclosure="'+element+'"]').removeClass("on");
				$(element).addClass("hidden");
			}
		}
	}



	// LANGUAGE FEATURES

	// Return a translation for a given translation ID, if exists. Otherwise return the default string that was supplied.
	function localiseExtension(theExtension, extensionID) {
		// Translate this screen or title.
		theExtension.setAttribute("data-menu-title", localisedString(theExtension.getAttribute("data-menu-title"), "menuTitle", extensionID));
		
		let elements = theExtension.querySelectorAll("*[data-localisation]");
		for (let element of elements) {
			element.innerText = localisedString(element.innerText, element.getAttribute("data-localisation"), extensionID);
		}
	}

	let translations;

	function localisedString(defaultString, translationID, extensionID) {
		let finalString;
		if (typeof translations !== 'undefined' && translations[extensionID]) {
			if (translations[extensionID][translationID]) {
				finalString = translations[extensionID][translationID];
			} else {
				finalString = defaultString;
			}
			
		} else {
			finalString = defaultString;
		}
		return finalString;
	}


	function localisedStringWithFormat(format, dynamics, translationID, extensionID) {
		if (translationID && extensionID) {
			format = localisedString(format, translationID, extensionID);
		}
		
		let finalString = format;
		let textItems = format.split("%@");
		let finalTextItems = [];
		if (textItems.length > 1) {
			if (dynamics == undefined) dynamics = [];
			textItems.forEach(function(item, index) {
				finalTextItems.push(item);
				if (typeof dynamics == "array") {
					if (dynamics[0]) finalTextItems.push(dynamics.shift());
				} else {
					if (index < textItems.length-1) finalTextItems.push(dynamics);
				}
			});
			finalString = finalTextItems.join("");
		}
		return finalString;
	}


	function capitaliseFirst(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}

	function commaAndList(list, andWord, translationID, extensionID) {
		let finalString;
		if (translationID && extensionID) {
			andWord = localisedString(andWord, translationID, extensionID);
		}
		if (list.length > 1) {
			for (var i = 0; i < list.length; i++) {
				if (i == 0) {
					finalString = list[0];
				} else if (i > 0 && i < list.length-1) {
					finalString += ", "+list[i];
				} else {
					finalString += " " + andWord + " " + list[i];
				}
			}
			return finalString;
		} else {
			return list[0];
		}
	}



	// ASK

	let askOpen = false;
	let askTransitionTimeout;
	let askCallbacks = null;
	let askCancelCallback = null;
	let askParent = null;
	let askExiting = false;
	function ask(menuID, dynamicContent, callbacks, cancelCallback) {
		if (menuID) {
			if (askOpen) {
				if (!askExiting) ask();
				setTimeout(function() {
					returnAsk();
					showAsk(menuID, dynamicContent, callbacks, cancelCallback);
				}, 250);
			} else {
				showAsk(menuID, dynamicContent, callbacks, cancelCallback);
			}
		} else {
			askExiting = true;
			if (askCancelCallback) askCancelCallback();
			$("#ask, #ask-back-plate").removeClass("visible");
			askTransitionTimeout = setTimeout(function() {
				$("#ask, #ask-back-plate").removeClass("block");
				returnAsk();
			}, 500);
			askCallbacks = null;
			askCancelCallback = null;
		}
	}

	function askOption(callbackIndex) {
		askExiting = true;
		$("#ask, #ask-back-plate").removeClass("visible");
		askTransitionTimeout = setTimeout(function() {
			$("#ask, #ask-back-plate").removeClass("block");
			returnAsk();
		}, 500);
		if (askCallbacks) {
			askCallbacks[callbackIndex]();
		}
		askCallbacks = null;
	}

	function showAsk(menuID, dynamicContent, callbacks, cancelCallback) {
		askOpen = true;
		if (callbacks) askCallbacks = callbacks;
		if (cancelCallback) askCancelCallback = cancelCallback;

		askParent = $("#"+menuID).parent();
		$("#ask-content").append($("#"+menuID).detach());
		$("#ask-content > *").addClass("menu-content ask-menu-content");
		if (dynamicContent) {
			for (let i = 0; i < dynamicContent.length; i++) {
				$("#ask-content .ask-dynamic-"+i).text(dynamicContent[i]);
			}
		}
		if (!$("#ask").hasClass("block")) {
			$("#ask, #ask-back-plate").addClass("block");
			setTimeout(function() {
				$("#ask, #ask-back-plate").addClass("visible");
			}, 150);
		} else {
			$("#ask, #ask-back-plate").addClass("visible");
		}
	}

	function returnAsk() {
		if (askOpen) {
			clearTimeout(askTransitionTimeout);
			$(askParent).append($("#ask-content > *").detach());
			askOpen = false;
			askExiting = false;
		}
	}


	// HOLD DOWN ON ELEMENTS

	let holdActionActivated = false;
	let holdTarget = null;
	let holdPosition = [];
	let holdTimeout = null;
	let clickHandler = null;

	// Drag detector cancels the appearance of the contextual menu in case the user moves away from the target whilst holding down.
	$(document).on("mouseout mousemove mouseup", ".hold", function(event) {
		endHold();
	});

	$(document).on("mousedown", ".hold", function(event) {
		startHold(this, event);
	});


	function startHold(target, event) {
		clickHandler = null;
		holdTarget = target;
		if (event.targetTouches) {
			holdPosition = [event.targetTouches[0].pageX, event.targetTouches[0].pageY];
		} else {
			holdPosition = [event.pageX, event.pageY];
		}
		holdTimeout = setTimeout(function() {
			if (!event.targetTouches) {
				if ($(holdTarget).attr('onclick')) {
					clickHandler = $(holdTarget).attr('onclick');
					$(holdTarget).removeAttr('onclick');
				}
			}
			holdAction = new Function('holdPosition', 'holdTarget', $(holdTarget).attr("data-hold"));
			holdAction(holdPosition, holdTarget);
		}, 300);
	}

	function endHold(event) {
		clearTimeout(holdTimeout);
		holdTimeout = null;
		if (clickHandler && this == holdTarget) {
			setTimeout(function() {
				$(holdTarget).attr('onclick', clickHandler);
				clickHandler = null;
			}, 20);
			if (event) event.preventDefault();
		}
	}


	// SLIDER WIDTH
	// Sliders that start their range from the centre need their widths to be updated when resized.

	function updateSliderWidths() {
		$(".ui-slider.range-from-centre").each(function() {
			$(".ui-slider-range div", this).css("max-width", $(this).width() / 2 + "px");
		});
	}



	// POPUP VIEWS

	// Common popup view with dynamic content.
	let currentPopup = null;
	let currentPopupParent = null;
	let popupCancelAction = null;
	let popupCancelTimeout;
	function showPopupView(popupContentID, overridePopup, cancelAction) {
		popupCancelAction = null;
		if (popupContentID) {
			if (!currentPopup || overridePopup == currentPopup) {
				if (currentPopupParent) {
					clearTimeout(popupCancelTimeout);
					$("#open-popup .popup-content").addClass("hidden");
					currentPopupParent.append($("#open-popup .popup-content").detach());
				}
				currentPopup = popupContentID;
				currentPopupParent = $("#"+popupContentID).parent();
				$("#open-popup").append($("#"+popupContentID).detach());
				$("#open-popup .popup-content").removeClass("hidden");
				
				// Apply the ID of the popup content view to the target view as a class so it can be targeted with CSS or JavaScript.
				$("#open-popup, #open-popup-back-plate").addClass("block");
				setTimeout(function() {
					$("#open-popup, #open-popup-back-plate").addClass("visible");
				}, 100);
				if (cancelAction != undefined) popupCancelAction = cancelAction;
			}
		}
	}


	function hidePopupView(view = null, universalOverride = false) {
		if (currentPopupParent) {
			if (view == currentPopup || universalOverride) {
				currentPopup = null;
				$("#open-popup, #open-popup-back-plate").removeClass("visible");
				popupCancelTimeout = setTimeout(function() {
					$("#open-popup .popup-content").addClass("hidden");
					currentPopupParent.append($("#open-popup .popup-content").detach());
					$("#open-popup, #open-popup-back-plate").removeClass("block");
					currentPopupParent = null;
				}, 500);
			}
		}
	}

	function popupBackplateClick() {
		if (popupCancelAction) {
			popupCancelAction();
		} else {
			hidePopupView(null, true);
		}
	}

	// WIZARD CONTAINER

	function wizard(wizardContainer, newScreen = null, buttons = null, noAnimation = false) {
		if (!newScreen) {
			// Set up the wizard.
			$(wizardContainer).addClass("wizard");
			$(wizardContainer+" > *").addClass("wizard-screen").removeClass("block");
			$(wizardContainer+" > *").first().addClass("block").removeClass("hidden-left hidden-right");
			return "Set up '"+wizardContainer+"' as a wizard structure.";
		} else {
			if (!$(wizardContainer+" "+newScreen).hasClass("block")) {
				if (buttons && typeof buttons == "object") buttons = buttons.join(", ");
				// Find the current screen and its relationship to the new screen.
				let hideScreen = $(wizardContainer+" .block");
				let showScreen = $(wizardContainer+" "+newScreen);
				let hideTo = null;
				let showFrom = null;
				if (showScreen.prevAll(".block").length) {
					// Current screen is before the new.
					hideTo = "left";
					showFrom = "right";
				} else if (showScreen.nextAll(".block").length) {
					hideTo = "right";
					showFrom = "left";
				}
				if (showFrom && hideTo) {
					hideScreen.addClass("hidden-"+hideTo);
					showScreen.removeClass("hidden-"+hideTo).addClass("hidden-"+showFrom);
					
					if (!noAnimation) {
						let buttonsWereDisabled = false;
						if (buttons) {
							buttonsWereDisabled = $(buttons).hasClass("disabled");
							$(buttons).addClass("disabled");
						}
						setTimeout(function() {
							hideScreen.removeClass("block");
							showScreen.addClass("block");
							$(wizardContainer).scrollTop(0);
							setTimeout(function() {
								showScreen.removeClass("hidden-"+showFrom);
							}, 20);
							if (buttons && !buttonsWereDisabled) {
								setTimeout(function() {
									$(buttons).removeClass("disabled");
								}, 500);
							}
						}, 300);
					} else {
						showScreen.removeClass("hidden-"+hideTo+" hidden-"+showFrom).addClass("block");
						hideScreen.removeClass("block");
						$(wizardContainer).scrollTop(0);
					}
				} else {
					console.error("Screen '"+newScreen+"' doesn't exist in wizard structure '"+wizardContainer+"'.");
				}
			}
		}
	}


	// TEXT INPUT

	let textInputCallback;
	let textInputMode = 0;
	let textInputOptions;
	let textInputCloseTimeout;
	let textInputOpen = false;

	function startTextInput(type, title, prompt, options, callback, cancelCallback) {
		clearTimeout(textInputCloseTimeout);
		$("#text-input, #text-input-back-plate").addClass("block");
		setTimeout(function() {
			$("#text-input, #text-input-back-plate").addClass("visible");
		}, 50);
		$("#text-input").removeClass("text password");
		$("#text-input-submit").addClass("disabled");
		
		textInputMode = type;
		if (type == 1) $("#text-input").addClass("text");
		if (type == 2) $("#text-input").addClass("password");
		if (type == 3) $("#text-input").addClass("text password");
		
		textInputOptions = options;
		
		if (options.autocapitalise) {
			if (options.autocapitalise == true) { 
				$("#text-input-plain").attr("autocapitalize", "sentences");
			} else {
				$("#text-input-plain").attr("autocapitalize", options.autocapitalise);
			}
		} else {
			$("#text-input-plain").attr("autocapitalize", "off");
		}
		
		if (options.autocorrect) {
			$("#text-input-plain").attr("autocorrect", "on");
		} else {
			$("#text-input-plain").attr("autocorrect", "off");
		}
		$("#text-input-password").attr("placeholder", "");
		$("#text-input-plain").attr("placeholder", "");
		if (options.placeholders.text) $("#text-input-plain").attr("placeholder", options.placeholders.text);
		if (options.placeholders.password) $("#text-input-password").attr("placeholder", options.placeholders.password);
		
		$("#text-input-plain, #text-input-password").val("");
		if (options.text) $("#text-input-plain").val(options.text);
		
		$("#text-prompt").text(prompt);
		$("#text-input h1").text(title);
		textInputCallback = callback;
		
		//setTimeout(function() {
		if (type == 2) {
			$("#text-input-password").focus();
		} else {
			$("#text-input-plain").focus();
		}
		//}, 600);
		validateTextInput();
		textInputOpen = true;
	}

	let textInputValid = false;
	function validateTextInput() {
		let textInputValid = true;
		let txt = $("#text-input-plain").val();
		let passwd = $("#text-input-password").val();
		if (textInputMode == 1 || textInputMode == 3) {
			if (!txt) {
				if (textInputOptions.optional && textInputOptions.optional.text) {
					textInputValid = true;
				} else {
					textInputValid = false;
				}
			} 
			if (textInputOptions.minLength && textInputOptions.minLength.text) {
				if (txt.length < textInputOptions.minLength.text) textInputValid = false;
			}
		}
		if (textInputMode == 2 || textInputMode == 3) {
			if (textInputOptions.optional && textInputOptions.optional.password) {
				if (textInputOptions.minLength.password && passwd != "") {
					if (passwd.length < textInputOptions.minLength.password) textInputValid = false;
				}
			} else {
				if (!passwd) textInputValid = false;
				if (textInputOptions.minLength && textInputOptions.minLength.password) {
					if (passwd.length < textInputOptions.minLength.password) textInputValid = false;
				}
			}
		}
		if (textInputValid) {
			$("#text-input-submit").removeClass("disabled");
		} else {
			$("#text-input-submit").addClass("disabled");
		}
	}

	function togglePasswordReveal() {
		let fieldType = "password" // default
		
		if($("#text-input-password").prop("type") == "password") {
			fieldType = "text";
		}
		
		$("#text-input-password").prop("type", fieldType);
		$("#text-input-password").focus();
	}

	function submitText() {
		if (textInputValid) {
			const txt = $("#text-input-plain").val();
			const passwd = $("#text-input-password").val();
			cancelText(true);
			textInputCallback({text: txt, password: passwd});
			return true;
		} else {
			return false;
		}
	}


	function cancelText(hideOnly) {
		$("#text-input-plain, #text-input-password").blur();
		$("#text-input, #text-input-back-plate").removeClass("visible");
		textInputCloseTimeout = setTimeout(function() {
			$("#text-input, #text-input-back-plate").removeClass("block");
			$("#text-input-plain").val("");
			$("#text-input-password").val("");
		}, 500);
		if (!hideOnly) {
			textInputCallback();
		}
		textInputOpen = false;
	}

	$(document).on('input blur', "input", function(event) {
		let eventType = event.type;
		if (eventType == "focusout") eventType = "blur";
		if ($(this).attr("id") == "text-input-plain" && eventType == "input") {
			validateTextInput();
		} else if ($(this).attr("id") == "text-input-password" && eventType == "input") {
			validateTextInput();
		} else {
			if ($(this).attr("data-value-callback")) {
				if (!$(this).attr("data-send-value-on") || eventType == $(this).attr("data-send-value-on")) {
					typeAction = new Function('text', "eventType", $(this).attr("data-value-callback"));
					typeAction($(this).val(), eventType);
				}
			}
		}
	});

	// UPLOAD FILES

	let uploadToExtension = null;
	let uploadOptions = null;
	let uploadNotifyTimeout;
	function uploadFile(options, extension, file) {
		if (file && file.name && (uploadToExtension || extension)) {
			if (extension) uploadToExtension = extension;
			console.log(file);
			if (options) uploadOptions = options;
			let types = [];
			let canUpload = false;
			let fileExtension;
			if (uploadOptions && uploadOptions.types) {
				types = uploadOptions.types;
			} else if (options && options.types) {
				types = options.types;
			} else {
				types = [];
			}
			if (types.length) {
				if (types.indexOf(file.type) != -1) {
					canUpload = true;
				}
			}
			if (uploadOptions.fileExtensions && uploadOptions.fileExtensions.length) {
				fileExtension = file.name.substring(file.name.lastIndexOf("."));
				if (uploadOptions.fileExtensions.indexOf(fileExtension) != -1) {
					canUpload = true;
				}
			}
			if (types.length == 0 && (!uploadOptions.fileExtensions || !uploadOptions.fileExtensions.length)) {
				canUpload = true; // Allow any file.
			}
			if (canUpload) {
				uploadNotifyTimeout = setTimeout(function() {
					// In most cases uploads are so fast there's no point showing a status.
					notify({title: "Uploading file...", icon: "attention", timeout: false}, "uploadFile");
				}, 500);
				fetch(window.location.protocol+"//"+productAddress+"/"+uploadToExtension+"/upload", {
					body: file,
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/octet-stream",
						"Content-Disposition": "attachment",
						"fileName": file.name,
						"filePath": (options && options.path) ? options.path : null,
						"customData": (options && options.customData) ? JSON.stringify(options.customData) : null
					}
				}).then(
					function(response) {
						uploadFile();
						if (response.status !== 202) {
							console.log("Extension can't receive files.");
							notify({title: "File upload unsuccesful", message: "This extension is not set up to receive files.", buttonTitle: "Close", buttonAction: "close", timeout: false}, "uploadFile");
						} else {
							console.log("File upload succeeded.");
						}
					}
				).catch(function(err) {
					console.log('Fetch error when uploading file:', err);
				});
				document.getElementById("file-input").value = "";
			} else {
				notify({title: "Wrong file type", message: "The selected file is not one of the accepted file types.", buttonTitle: "Close", buttonAction: "close", timeout: false}, "uploadFile");
				document.getElementById("file-input").value = "";
			}
		} else if (options && options.title && extension) {
			uploadToExtension = extension;
			uploadOptions = options;
			$("#upload h2").text(options.title);
			if (options.message) {
				$("#upload p").text(options.message).removeClass("hidden");
			} else {
				$("#upload p").addClass("hidden");
			}
			if (options.fileExtensions) { // Specify file type.
				$("#file-input").attr("accept", options.fileExtensions.join(","));
			} else {
				$("#file-input").attr("accept", "");
			}
			$("#upload, #upload-back-plate").addClass("block");
			setTimeout(function() {
				$("#upload, #upload-back-plate").addClass("visible");
			}, 150);
		} else {
			$("#upload, #upload-back-plate").removeClass("visible");
			setTimeout(function() {
				$("#upload, #upload-back-plate").removeClass("block");
			}, 500);
			clearTimeout(uploadNotifyTimeout);
			notify(false, "uploadFile");
		}
	}


	// MULTI-TOUCH EVENTS

	document.ontouchstart = function(event) {
		if (event.target.id.indexOf("-edge-swipe") > -1) {
			if (event.targetTouches) {
				event.preventDefault();
			}
		}
		
		if (event.target.className.indexOf("hold") != -1) {
			startHold(event.target, event);
		}
	}

	document.ontouchmove = function(event) {
		if (event.target.id.indexOf("-edge-swipe") > -1) {
			if (event.targetTouches) {
				event.preventDefault();
			}
		}
		
		if (event.target.className.indexOf("hold") != -1) {
			endHold(event);
		}	
	}

	document.ontouchend = function(event) {		
		if (event.target.className.indexOf("hold") != -1) {
			endHold(event);
		}
	}

	function insertConnectionGuide() {
		markup = '<div class="connection-guide">\
			<img src="common/4ca-connections.png" alt="Beocreate 4-Channel Amplifier connections" />\
			<div class="connection-guide-letter letter-a">A <div class="channel-dot a"></div></div>\
			<div class="connection-guide-letter letter-b">B <div class="channel-dot b"></div></div>\
			<div class="connection-guide-letter letter-c">C <div class="channel-dot c"></div></div>\
			<div class="connection-guide-letter letter-d">D <div class="channel-dot d"></div></div>\
		</div>';
		document.write(markup);
	}


	// SUPPORT

	// https://stackoverflow.com/questions/359788/how-to-execute-a-javascript-function-when-i-have-its-name-as-a-string
	function executeFunction(functionName, args) {
		const namespaces = functionName.split(".");
		const func = namespaces.pop();
		let context = window;
		for(let i = 0; i < namespaces.length; i++) {
			context = context[namespaces[i]];
		}
		return context[func].apply(context, args);
	}

	function functionExists(funcName) {
		let namespaces = funcName.split(".");
		if (namespaces.length == 1) {
			if (window[funcName]) {
				return true;
			} else {
				return false;
			}
		} else {
			if (window[namespaces[0]][namespaces[1]]) {
				return true;
			} else {
				return false;
			}
		}
	}

	// Converts from degrees to radians.
	Math.radians = function(degrees) {
		return degrees * Math.PI / 180;
	};

	Math.distance = function(x1, y1, x2, y2) {
		return Math.sqrt((x2 -= x1) * x2 + (y2 -= y1) * y2);
	};

	Math.angle = function(x1, y1, x2, y2) {
		y = x1 - x2;
		x = y1 - y2;
		theta = Math.atan2(-y, x);
		theta = theta * -1;
		theta = theta * (180 / Math.PI);
		if (theta < 0) {
			theta = 360+theta;
		}
		return theta.toFixed(1);
	}

	// Detect platform to tailor instructions.
	// https://stackoverflow.com/questions/38241480/detect-macos-ios-windows-android-and-linux-os-with-js
	// (modified to return a human-readable string that will be used in the UI)
	function getOS() {
		let userAgent = window.navigator.userAgent,
			platform = window.navigator.platform,
			macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
			windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
			iosPlatforms = ['iPhone', 'iPad', 'iPod'],
			os = null;
			osUI = "";
		if (macosPlatforms.indexOf(platform) !== -1) {
			os = 'macos';
			osUI = "Mac";
		} else if (iosPlatforms.indexOf(platform) !== -1) {
			os = 'ios';
			osUI = platform;
			if (!window.navigator.standalone) showStandaloneCallToAction(true);
		} else if (windowsPlatforms.indexOf(platform) !== -1) {
			os = 'windows';
			osUI = "Windows device";
		} else if (/Android/.test(userAgent)) {
			os = 'android';
			osUI = "Android device";
		} else {
			os = 'other';
			osUI = "device"
		}

		return [os, osUI];
	}

	function showStandaloneCallToAction(show, force) {
		if (show) {
			setTimeout(function() {
				if (force || (!document.body.classList.contains("setup") && !localStorage.beoStandaloneCallToActionDismissed)) {
					document.querySelector("#standalone-call-to-action").classList.remove("hidden");
					setTimeout(function() {
						document.querySelector("#standalone-call-to-action").classList.add("visible");
					}, 100);
				}
			}, 2000);
		} else {
			localStorage.beoStandaloneCallToActionDismissed = true;
			document.querySelector("#standalone-call-to-action").classList.remove("visible");
			setTimeout(function() {
				document.querySelector("#standalone-call-to-action").classList.add("hidden");
			}, 500);
		}
	}

	return {
		appearance: "default",
		ask: ask,
		askOption: askOption,
		showPopupView: showPopupView,
		hidePopupView: hidePopupView,
		popupBackplateClick: popupBackplateClick,
		startTextInput: startTextInput,
		togglePasswordReveal: togglePasswordReveal,
		submitText: submitText,
		cancelText: cancelText,
		uploadFile: uploadFile,
		executeFunction: executeFunction,
		functionExists: functionExists,
		localisedString: localisedString,
		localisedStringWithFormat: localisedStringWithFormat,
		capitaliseFirst: capitaliseFirst,
		commaAndList: commaAndList,
		showMenuTab: showMenuTab,
		notify: notify,
		restoreState: restoreState,
		setMenuTitle: setMenuTitle,
		showExtension: showExtension,
		showExtensionWithHistory: showExtensionWithHistory,
		showDeepMenu: showDeepMenu,
		toggleMainMenu: toggleMainMenu,
		chooseNavigationMode: chooseNavigationMode,
		createMenuItem: createMenuItem,
		createCollectionItem: createCollectionItem,
		setSymbol: setSymbol,
		sendToProductView: sendToProductView,
		setAppearance: setAppearance,
		isDarkAppearance: function() {return darkAppearance},
		isShownInBeoApp: function() {return inBeoApp},
		insertConnectionGuide: insertConnectionGuide,
		wizard: wizard,
		getOS: getOS,
		showStandaloneCallToAction: showStandaloneCallToAction
	}
})();