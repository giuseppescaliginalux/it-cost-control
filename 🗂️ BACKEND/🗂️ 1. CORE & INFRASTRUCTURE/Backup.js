/**
 * Crea una copia completa del Database in una cartella specifica.
 */
function backupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backupFolderName = "IT Cost Control - BACKUPS";
  
  // Trova o crea la cartella di backup
  let folders = DriveApp.getFoldersByName(backupFolderName);
  let backupFolder;
  if (folders.hasNext()) {
    backupFolder = folders.next();
  } else {
    backupFolder = DriveApp.createFolder(backupFolderName);
  }
  
  // Genera un nome con timestamp
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm");
  const backupName = `BACKUP_${dateStr}_${ss.getName()}`;
  
  // Crea la copia fisica del file
  const file = DriveApp.getFileById(ss.getId());
  file.makeCopy(backupName, backupFolder);
  
  console.log(`Backup eseguito con successo: ${backupName}`);
}