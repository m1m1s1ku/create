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

ipcMain.on("bindAuxToAMP", () => {
	bindBerries();
});

ipcMain.on("getAllProducts", () => {
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

let sshInstance: NodeSSH | null = null;

let currentRouting: {
	from: string;
	to: string;
} | null = null;

export async function getCurrentRouting() {
	if(!currentRouting) {		
		const source = findProduct(defaultRouting.from);
		const sourceLocalIP = source?.addresses[0] ?? null;
		
		if(!sourceLocalIP) {
			console.error('Can\'t find source HifiBerry');
			return;
		}

		const client = await safeSSHClient(sourceLocalIP, username, password);
		const isLocked = await isBindingLocked(client);
		if(!isLocked) {
			currentRouting = null;
		} else {
			currentRouting = defaultRouting;
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
	const isLockedCommand = `cat ${lockFileName}`;

	const isLocked = await client.execCommand(isLockedCommand);
	if(isLocked.stderr) {
		return false;
	}

	if(isLocked.stdout.length !== 0) {
		return true;
	}

	return false;
}

export async function bindBerries() {
	const audioParams = `${bitrate} ${codec} ${samplingRate} ${channels}`;

	const source = findProduct(defaultRouting.from);
	const destination = findProduct(defaultRouting.to);

	const sourceLocalIP = source?.addresses[0] ?? null;
	const destinationLocalIP = destination?.addresses[0] ?? null;

	// Don't know where to bind. ;)
	if(!sourceLocalIP || !destinationLocalIP) { return; }

	const linkCommand = `arecord -D plughw:0,0 ${audioParams} | ssh -C ${username}@${destinationLocalIP} -i ${sshKeyFileName} aplay ${audioParams}`;
	const killCommand = `killall arecord`;
	const lockCommand = `touch ${lockFileName} | echo ${destination?.name} > ${lockFileName}`;

	const client = await safeSSHClient(sourceLocalIP, username, password);
	const isLocked = await isBindingLocked(client);

	if(isLocked) {
		console.warn('Already bound killing');
		await client.execCommand(`rm ${lockFileName}`);
		await client.execCommand(killCommand);

		currentRouting = null;

		await getCurrentRouting();
	} else {
		await client.execCommand(lockCommand);
		console.warn('Start binding to ', destination?.name, 'from', source?.name);

		// @note : Floating promise, because will never yield a result except if broken pipe / execCommand kill
		client.exec(linkCommand, [], {
			onStdout(chunk) {
				console.log('out:', chunk.toString('utf8'));
				onRefreshProducts();
			},
			onStderr(chunk) {
				console.log('err:', chunk.toString('utf8'));
				onRefreshProducts();
			}
		}).catch(async err => {
			// @note : "normal" error, stopping the current streaming exec.
			console.warn('Error while executing linkCommand');
			currentRouting = null;
			await client.execCommand(`rm ${lockFileName}`);
			await getCurrentRouting();
		});
		console.warn('executed linkComand');
	}
}