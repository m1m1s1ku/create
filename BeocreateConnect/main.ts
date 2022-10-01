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
import { app, BrowserWindow, ipcMain, nativeTheme, systemPreferences } from 'electron';


import { NodeSSH } from 'node-ssh';
import { ClientChannel } from 'ssh2';
import { createWindow } from './utils';
import { products, startDiscovery, startManualDiscovery } from './network';

let win: BrowserWindow | null = null;
  
app.on('ready', () => {
	win = createWindow();
	onRefreshProducts();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});

app.on('activate', () => {
	if(win) { return; }
	
	win = createWindow();
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

ipcMain.on("getAllProducts", (event, arg) => {
	win?.webContents.send('discoveredProducts', products);
});

function onRefreshProducts() {
	startDiscovery(win); 
	startManualDiscovery(win);
}

ipcMain.on("refreshProducts", onRefreshProducts);

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

export let clientChannel: ClientChannel | null = null;
export let sshInstance: NodeSSH | null = null;
export let currentRouting: {
	from: string;
	to: string;
} | null = null;

export async function connectSSH() {
	function cleanup () {
		sshInstance?.dispose();
		clientChannel?.close();
		clientChannel = null;
		sshInstance = null;
		currentRouting = null;
		onRefreshProducts();
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
				onRefreshProducts();
			},
			onStderr(chunk) {
				console.log('err:', chunk.toString('utf8'));
				onRefreshProducts();
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