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

// BEOCREATE CONNECT
import { app, BrowserWindow, ipcMain, nativeTheme, systemPreferences } from 'electron';

import { NodeSSH } from 'node-ssh';
import { ClientChannel } from 'ssh2';

import { createWindow } from './utils';
import { 
	findProduct, 
	getProducts, 
	startDiscovery, 
	startManualDiscovery 
} from './network';

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

ipcMain.on("bindAuxToAMP", (event, arg) => {
	bindBerries();
});

ipcMain.on("getAllProducts", (event, arg) => {
	const products = getProducts();
	win?.webContents.send('discoveredProducts', products);
});

function onRefreshProducts() {
	startDiscovery(win); 
	startManualDiscovery(win);
}

ipcMain.on("refreshProducts", onRefreshProducts);

// @todo : Add settings to change this easily
const defaultRouting = {
	from: 'AuxBerry',
	to: 'HiFiBerry',
};

const bitrate = "-f S24_LE";
const codec = "-t wav";
const samplingRate = "-r 60000";
const channels = "-c2"

const username = 'root';
const password = 'hifiberry';
const sshKeyFileName = 'rcaberry';
const lockFileName = 'connected.lock';

let clientChannel: ClientChannel | null = null;
let sshInstance: NodeSSH | null = null;

let currentRouting: {
	from: string;
	to: string;
} | null = null;

export async function getCurrentRouting() {
	if(!currentRouting) {
		currentRouting = defaultRouting;
		
		const source = findProduct(currentRouting.from);
		const sourceLocalIP = source?.addresses[0] ?? null;
		
		if(!sourceLocalIP) {
			console.error('Can\'t find source HifiBerry');
			return;
		}

		const client = await safeSSHClient(sourceLocalIP, username, password);
		const isLocked = await isBindingLocked(client);
		if(!isLocked) {
			currentRouting = null;
		}
	}

	return currentRouting;
}

export async function closeSSHClient() {
	if(!sshInstance) { return; }

	sshInstance.dispose();
}

export async function safeSSHClient(sourceIP: string, username: string, password: string): Promise<NodeSSH> {
	if(!sshInstance || !sshInstance.isConnected()){
		clientChannel?.close();
		sshInstance?.dispose();
		sshInstance = new NodeSSH();
	}

	await sshInstance.connect({
		host: sourceIP,
		username,
		password
	});

	return sshInstance;
}

export async function isBindingLocked(client: NodeSSH) {
	const lockFileName = 'connected.lock';
	const isLockedCommand = `cat ${lockFileName}`;

	const isLocked = await client.execCommand(isLockedCommand);

	if(isLocked.stdout) {
		return true;
	}

	return false;
}

export async function bindBerries() {
	const audioParams = `${bitrate} ${codec} ${samplingRate} ${channels}`;

	const source = findProduct(defaultRouting.from);
	const destination = findProduct(defaultRouting.to);

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

	const linkCommand = `arecord -D plughw:0,0 ${audioParams} | ssh -C ${username}@${destinationLocalIP} -i ${sshKeyFileName} aplay ${audioParams}`;
	const killCommand = `killall arecord | rm ${lockFileName}`;
	const lockCommand = `touch ${lockFileName} | echo ${destination?.name} > ${lockFileName}`;

	const client = await safeSSHClient(sourceLocalIP, username, password);
	const isLocked = await isBindingLocked(client);

	if(isLocked) {
		console.warn('Already bound killing');
		await client.execCommand(killCommand);
	} else {
		await client.execCommand(lockCommand);
		console.warn('Start binding to ', destination?.name, 'from', source?.name);
		await client.exec(linkCommand, [], {
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